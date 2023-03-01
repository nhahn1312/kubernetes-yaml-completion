/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isNumber, equals, isBoolean, isString, isDefined, isObject } from '../utils/objects';
import { extendedRegExp, stringLength } from '../utils/strings';
import {
    ASTNode,
    ObjectASTNode,
    ArrayASTNode,
    NumberASTNode,
    StringASTNode,
    PropertyASTNode,
    ErrorCode,
    DiagnosticSeverity,
    SchemaDraft
} from 'vscode-json-languageservice';

import * as l10n from '@vscode/l10n';
import { ValidationResult } from './validationResult';
import { IEvaluationContext, ISchemaCollector, NoOpSchemaCollector } from './schemaCollector';
import { ValidationUtil } from '../utils/validation';
import { JSONSchema, JSONSchemaRef } from '../types/jsonSchema';

export interface JSONDocumentConfig {
    collectComments?: boolean;
    schemaDraft?: SchemaDraft;
}

export enum EnumMatch {
    Key,
    Enum
}

export class SchemaValidator {
    private static readonly formats = {
        'color-hex': {
            errorMessage: l10n.t('Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.'),
            pattern: /^#([0-9A-Fa-f]{3,4}|([0-9A-Fa-f]{2}){3,4})$/
        },
        'date-time': {
            errorMessage: l10n.t('String is not a RFC3339 date-time.'),
            pattern:
                /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)([01][0-9]|2[0-3]):([0-5][0-9]))$/i
        },
        date: {
            errorMessage: l10n.t('String is not a RFC3339 date.'),
            pattern: /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/i
        },
        time: {
            errorMessage: l10n.t('String is not a RFC3339 time.'),
            pattern:
                /^([01][0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)([01][0-9]|2[0-3]):([0-5][0-9]))$/i
        },
        email: {
            errorMessage: l10n.t('String is not an e-mail address.'),
            pattern:
                /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}))$/
        },
        hostname: {
            errorMessage: l10n.t('String is not a hostname.'),
            pattern:
                /^(?=.{1,253}\.?$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[-0-9a-z]{0,61}[0-9a-z])?)*\.?$/i
        },
        ipv4: {
            errorMessage: l10n.t('String is not an IPv4 address.'),
            pattern: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
        },
        ipv6: {
            errorMessage: l10n.t('String is not an IPv6 address.'),
            pattern:
                /^((([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){6}(:[0-9a-f]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){5}(((:[0-9a-f]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:))|(([0-9a-f]{1,4}:){4}(((:[0-9a-f]{1,4}){1,3})|((:[0-9a-f]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){3}(((:[0-9a-f]{1,4}){1,4})|((:[0-9a-f]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){2}(((:[0-9a-f]{1,4}){1,5})|((:[0-9a-f]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(([0-9a-f]{1,4}:){1}(((:[0-9a-f]{1,4}){1,6})|((:[0-9a-f]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:))|(:(((:[0-9a-f]{1,4}){1,7})|((:[0-9a-f]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/i
        }
    };

    public static validate(
        n: ASTNode | undefined,
        schema: JSONSchema,
        validationResult: ValidationResult,
        matchingSchemas: ISchemaCollector,
        context: IEvaluationContext
    ): void {
        if (!n || !matchingSchemas.include(n)) {
            return;
        }
        if (n.type === 'property') {
            return SchemaValidator.validate(n.valueNode, schema, validationResult, matchingSchemas, context);
        }
        const node = n;
        _validateNode();

        switch (node.type) {
            case 'object':
                _validateObjectNode(node);
                break;
            case 'array':
                _validateArrayNode(node);
                break;
            case 'string':
                _validateStringNode(node);
                break;
            case 'number':
                _validateNumberNode(node);
                break;
        }

        matchingSchemas.add({ node: node, schema: schema });

        function _validateNode() {
            function matchesType(type: string) {
                return node.type === type || (type === 'integer' && node.type === 'number' && node.isInteger);
            }

            if (Array.isArray(schema.type)) {
                if (!schema.type.some(matchesType)) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message:
                            schema.errorMessage ||
                            l10n.t('Incorrect type. Expected one of {0}.', (<string[]>schema.type).join(', '))
                    });
                }
            } else if (schema.type) {
                if (!matchesType(schema.type)) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message: schema.errorMessage || l10n.t('Incorrect type. Expected "{0}".', schema.type)
                    });
                }
            }
            if (Array.isArray(schema.allOf)) {
                for (const subSchemaRef of schema.allOf) {
                    const subValidationResult = new ValidationResult();
                    const subMatchingSchemas = matchingSchemas.newSub();
                    SchemaValidator.validate(
                        node,
                        ValidationUtil.asSchema(subSchemaRef),
                        subValidationResult,
                        subMatchingSchemas,
                        context
                    );
                    validationResult.merge(subValidationResult);
                    matchingSchemas.merge(subMatchingSchemas);
                }
            }
            const notSchema = ValidationUtil.asSchema(schema.not);
            if (notSchema) {
                const subValidationResult = new ValidationResult();
                const subMatchingSchemas = matchingSchemas.newSub();
                SchemaValidator.validate(node, notSchema, subValidationResult, subMatchingSchemas, context);
                if (!subValidationResult.hasProblems()) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message: l10n.t('Matches a schema that is not allowed.')
                    });
                }
                for (const ms of subMatchingSchemas.schemas) {
                    ms.inverted = !ms.inverted;
                    matchingSchemas.add(ms);
                }
            }

            const testAlternatives = (alternatives: JSONSchemaRef[], maxOneMatch: boolean) => {
                const matches = [];

                // remember the best match that is used for error messages
                let bestMatch:
                    | { schema: JSONSchema; validationResult: ValidationResult; matchingSchemas: ISchemaCollector }
                    | undefined = undefined;
                for (const subSchemaRef of alternatives) {
                    const subSchema = ValidationUtil.asSchema(subSchemaRef);
                    const subValidationResult = new ValidationResult();
                    const subMatchingSchemas = matchingSchemas.newSub();
                    SchemaValidator.validate(node, subSchema, subValidationResult, subMatchingSchemas, context);
                    if (!subValidationResult.hasProblems()) {
                        matches.push(subSchema);
                    }
                    if (!bestMatch) {
                        bestMatch = {
                            schema: subSchema,
                            validationResult: subValidationResult,
                            matchingSchemas: subMatchingSchemas
                        };
                    } else {
                        if (
                            !maxOneMatch &&
                            !subValidationResult.hasProblems() &&
                            !bestMatch.validationResult.hasProblems()
                        ) {
                            // no errors, both are equally good matches
                            bestMatch.matchingSchemas.merge(subMatchingSchemas);
                            bestMatch.validationResult.propertiesMatches += subValidationResult.propertiesMatches;
                            bestMatch.validationResult.propertiesValueMatches +=
                                subValidationResult.propertiesValueMatches;
                            bestMatch.validationResult.mergeProcessedProperties(subValidationResult);
                        } else {
                            const compareResult = subValidationResult.compare(bestMatch.validationResult);
                            if (compareResult > 0) {
                                // our node is the best matching so far
                                bestMatch = {
                                    schema: subSchema,
                                    validationResult: subValidationResult,
                                    matchingSchemas: subMatchingSchemas
                                };
                            } else if (compareResult === 0) {
                                // there's already a best matching but we are as good
                                bestMatch.matchingSchemas.merge(subMatchingSchemas);
                                bestMatch.validationResult.mergeEnumValues(subValidationResult);
                            }
                        }
                    }
                }

                //nhahn[edit]: Changed Use kubernetes kind to find appropriate schema
                if (matches.length > 1 && maxOneMatch) {
                    const matchesWithGroupVersionKind = matches.filter((value, index) => {
                        return !!value['x-kubernetes-group-version-kind'];
                    });

                    validationResult.problems.push({
                        location: { offset: node.offset, length: 1 },
                        message: l10n.t('Matches multiple schemas when only one must validate.')
                    });
                }
                if (bestMatch) {
                    validationResult.merge(bestMatch.validationResult);
                    matchingSchemas.merge(bestMatch.matchingSchemas);
                }
                return matches.length;
            };
            if (Array.isArray(schema.anyOf)) {
                testAlternatives(schema.anyOf, false);
            }
            if (Array.isArray(schema.oneOf)) {
                testAlternatives(schema.oneOf, true);
            }

            const testBranch = (schema: JSONSchemaRef) => {
                const subValidationResult = new ValidationResult();
                const subMatchingSchemas = matchingSchemas.newSub();

                SchemaValidator.validate(
                    node,
                    ValidationUtil.asSchema(schema),
                    subValidationResult,
                    subMatchingSchemas,
                    context
                );

                validationResult.merge(subValidationResult);
                matchingSchemas.merge(subMatchingSchemas);
            };

            const testCondition = (ifSchema: JSONSchemaRef, thenSchema?: JSONSchemaRef, elseSchema?: JSONSchemaRef) => {
                const subSchema = ValidationUtil.asSchema(ifSchema);
                const subValidationResult = new ValidationResult();
                const subMatchingSchemas = matchingSchemas.newSub();

                SchemaValidator.validate(node, subSchema, subValidationResult, subMatchingSchemas, context);
                matchingSchemas.merge(subMatchingSchemas);
                validationResult.mergeProcessedProperties(subValidationResult);

                if (!subValidationResult.hasProblems()) {
                    if (thenSchema) {
                        testBranch(thenSchema);
                    }
                } else if (elseSchema) {
                    testBranch(elseSchema);
                }
            };

            const ifSchema = ValidationUtil.asSchema(schema.if);
            if (ifSchema) {
                testCondition(ifSchema, ValidationUtil.asSchema(schema.then), ValidationUtil.asSchema(schema.else));
            }

            if (Array.isArray(schema.enum)) {
                const val = ValidationUtil.getNodeValue(node);
                let enumValueMatch = false;
                for (const e of schema.enum) {
                    if (equals(val, e)) {
                        enumValueMatch = true;
                        break;
                    }
                }
                validationResult.enumValues = schema.enum;
                validationResult.enumValueMatch = enumValueMatch;
                if (!enumValueMatch) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        code: ErrorCode.EnumValueMismatch,
                        message:
                            schema.errorMessage ||
                            l10n.t(
                                'Value is not accepted. Valid values: {0}.',
                                schema.enum.map((v) => JSON.stringify(v)).join(', ')
                            )
                    });
                }
            }

            if (isDefined(schema.const)) {
                const val = ValidationUtil.getNodeValue(node);
                if (!equals(val, schema.const)) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        code: ErrorCode.EnumValueMismatch,
                        message: schema.errorMessage || l10n.t('Value must be {0}.', JSON.stringify(schema.const))
                    });
                    validationResult.enumValueMatch = false;
                } else {
                    validationResult.enumValueMatch = true;
                }
                validationResult.enumValues = [schema.const];
            }

            let deprecationMessage = schema.deprecationMessage;
            if ((deprecationMessage || schema.deprecated) && node.parent) {
                deprecationMessage = deprecationMessage || l10n.t('Value is deprecated');
                validationResult.problems.push({
                    location: { offset: node.parent.offset, length: node.parent.length },
                    severity: DiagnosticSeverity.Warning,
                    message: deprecationMessage,
                    code: ErrorCode.Deprecated
                });
            }
        }

        function _validateNumberNode(node: NumberASTNode): void {
            const val = node.value;

            function normalizeFloats(float: number): { value: number; multiplier: number } | null {
                const parts = /^(-?\d+)(?:\.(\d+))?(?:e([-+]\d+))?$/.exec(float.toString());
                return (
                    parts && {
                        value: Number(parts[1] + (parts[2] || '')),
                        multiplier: (parts[2]?.length || 0) - (parseInt(parts[3]) || 0)
                    }
                );
            }
            if (isNumber(schema.multipleOf)) {
                let remainder = -1;
                if (Number.isInteger(schema.multipleOf)) {
                    remainder = val % schema.multipleOf;
                } else {
                    const normMultipleOf = normalizeFloats(schema.multipleOf);
                    const normValue = normalizeFloats(val);
                    if (normMultipleOf && normValue) {
                        const multiplier = 10 ** Math.abs(normValue.multiplier - normMultipleOf.multiplier);
                        if (normValue.multiplier < normMultipleOf.multiplier) {
                            normValue.value *= multiplier;
                        } else {
                            normMultipleOf.value *= multiplier;
                        }
                        remainder = normValue.value % normMultipleOf.value;
                    }
                }
                if (remainder !== 0) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message: l10n.t('Value is not divisible by {0}.', schema.multipleOf)
                    });
                }
            }
            function getExclusiveLimit(
                limit: number | undefined,
                exclusive: boolean | number | undefined
            ): number | undefined {
                if (isNumber(exclusive)) {
                    return exclusive;
                }
                if (isBoolean(exclusive) && exclusive) {
                    return limit;
                }
                return undefined;
            }
            function getLimit(limit: number | undefined, exclusive: boolean | number | undefined): number | undefined {
                if (!isBoolean(exclusive) || !exclusive) {
                    return limit;
                }
                return undefined;
            }
            const exclusiveMinimum = getExclusiveLimit(schema.minimum, schema.exclusiveMinimum);
            if (isNumber(exclusiveMinimum) && val <= exclusiveMinimum) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    message: l10n.t('Value is below the exclusive minimum of {0}.', exclusiveMinimum)
                });
            }
            const exclusiveMaximum = getExclusiveLimit(schema.maximum, schema.exclusiveMaximum);
            if (isNumber(exclusiveMaximum) && val >= exclusiveMaximum) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    message: l10n.t('Value is above the exclusive maximum of {0}.', exclusiveMaximum)
                });
            }
            const minimum = getLimit(schema.minimum, schema.exclusiveMinimum);
            if (isNumber(minimum) && val < minimum) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    message: l10n.t('Value is below the minimum of {0}.', minimum)
                });
            }
            const maximum = getLimit(schema.maximum, schema.exclusiveMaximum);
            if (isNumber(maximum) && val > maximum) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    message: l10n.t('Value is above the maximum of {0}.', maximum)
                });
            }
        }

        function _validateStringNode(node: StringASTNode): void {
            if (isNumber(schema.minLength) && stringLength(node.value) < schema.minLength) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    message: l10n.t('String is shorter than the minimum length of {0}.', schema.minLength)
                });
            }

            if (isNumber(schema.maxLength) && stringLength(node.value) > schema.maxLength) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    message: l10n.t('String is longer than the maximum length of {0}.', schema.maxLength)
                });
            }

            if (isString(schema.pattern)) {
                const regex = extendedRegExp(schema.pattern);
                if (!regex?.test(node.value)) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message:
                            schema.patternErrorMessage ||
                            schema.errorMessage ||
                            l10n.t('String does not match the pattern of "{0}".', schema.pattern)
                    });
                }
            }

            if (schema.format) {
                switch (schema.format) {
                    case 'uri':
                    case 'uri-reference':
                        {
                            let errorMessage;
                            if (!node.value) {
                                errorMessage = l10n.t('URI expected.');
                            } else {
                                const match = /^(([^:/?#]+?):)?(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?/.exec(
                                    node.value
                                );
                                if (!match) {
                                    errorMessage = l10n.t('URI is expected.');
                                } else if (!match[2] && schema.format === 'uri') {
                                    errorMessage = l10n.t('URI with a scheme is expected.');
                                }
                            }
                            if (errorMessage) {
                                validationResult.problems.push({
                                    location: { offset: node.offset, length: node.length },
                                    message:
                                        schema.patternErrorMessage ||
                                        schema.errorMessage ||
                                        l10n.t('String is not a URI: {0}', errorMessage)
                                });
                            }
                        }
                        break;
                    case 'color-hex':
                    case 'date-time':
                    case 'date':
                    case 'time':
                    case 'email':
                    case 'hostname':
                    case 'ipv4':
                    case 'ipv6': {
                        const format = SchemaValidator.formats[schema.format];
                        if (!node.value || !format.pattern.exec(node.value)) {
                            validationResult.problems.push({
                                location: { offset: node.offset, length: node.length },
                                message: schema.patternErrorMessage || schema.errorMessage || format.errorMessage
                            });
                        }
                        break;
                    }
                    default:
                }
            }
        }
        function _validateArrayNode(node: ArrayASTNode): void {
            let prefixItemsSchemas: JSONSchemaRef[] | undefined;
            let additionalItemSchema: JSONSchemaRef | undefined;
            if (context.schemaDraft >= SchemaDraft.v2020_12) {
                prefixItemsSchemas = schema.prefixItems;
                additionalItemSchema = !Array.isArray(schema.items) ? schema.items : undefined;
            } else {
                prefixItemsSchemas = Array.isArray(schema.items) ? schema.items : undefined;
                additionalItemSchema = !Array.isArray(schema.items) ? schema.items : schema.additionalItems;
            }
            let index = 0;
            if (prefixItemsSchemas !== undefined) {
                const max = Math.min(prefixItemsSchemas.length, node.items.length);
                for (; index < max; index++) {
                    const subSchemaRef = prefixItemsSchemas[index];
                    const subSchema = ValidationUtil.asSchema(subSchemaRef);
                    const itemValidationResult = new ValidationResult();
                    const item = node.items[index];
                    if (item) {
                        SchemaValidator.validate(item, subSchema, itemValidationResult, matchingSchemas, context);
                        validationResult.mergePropertyMatch(itemValidationResult);
                    }
                    validationResult.processedProperties.add(String(index));
                }
            }
            if (additionalItemSchema !== undefined && index < node.items.length) {
                if (typeof additionalItemSchema === 'boolean') {
                    if (additionalItemSchema === false) {
                        validationResult.problems.push({
                            location: { offset: node.offset, length: node.length },
                            message: l10n.t(
                                'Array has too many items according to schema. Expected {0} or fewer.',
                                index
                            )
                        });
                    }
                    for (; index < node.items.length; index++) {
                        validationResult.processedProperties.add(String(index));
                        validationResult.propertiesValueMatches++;
                    }
                } else {
                    for (; index < node.items.length; index++) {
                        const itemValidationResult = new ValidationResult();
                        SchemaValidator.validate(
                            node.items[index],
                            additionalItemSchema,
                            itemValidationResult,
                            matchingSchemas,
                            context
                        );
                        validationResult.mergePropertyMatch(itemValidationResult);
                        validationResult.processedProperties.add(String(index));
                    }
                }
            }

            const containsSchema = ValidationUtil.asSchema(schema.contains);
            if (containsSchema) {
                let containsCount = 0;
                for (let index = 0; index < node.items.length; index++) {
                    const item = node.items[index];
                    const itemValidationResult = new ValidationResult();
                    SchemaValidator.validate(
                        item,
                        containsSchema,
                        itemValidationResult,
                        NoOpSchemaCollector.instance,
                        context
                    );
                    if (!itemValidationResult.hasProblems()) {
                        containsCount++;
                        if (context.schemaDraft >= SchemaDraft.v2020_12) {
                            validationResult.processedProperties.add(String(index));
                        }
                    }
                }
                if (containsCount === 0 && !isNumber(schema.minContains)) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message: schema.errorMessage || l10n.t('Array does not contain required item.')
                    });
                }
                if (isNumber(schema.minContains) && containsCount < schema.minContains) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message: l10n.t(
                            'Array has too few items that match the contains contraint. Expected {0} or more.',
                            schema.minContains
                        )
                    });
                }
                if (isNumber(schema.maxContains) && containsCount > schema.maxContains) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message: l10n.t(
                            'Array has too many items that match the contains contraint. Expected {0} or less.',
                            schema.maxContains
                        )
                    });
                }
            }

            const unevaluatedItems = schema.unevaluatedItems;
            if (unevaluatedItems !== undefined) {
                for (let i = 0; i < node.items.length; i++) {
                    if (!validationResult.processedProperties.has(String(i))) {
                        if (unevaluatedItems === false) {
                            validationResult.problems.push({
                                location: { offset: node.offset, length: node.length },
                                message: l10n.t('Item does not match any validation rule from the array.')
                            });
                        } else {
                            const itemValidationResult = new ValidationResult();
                            SchemaValidator.validate(
                                node.items[i],
                                <any>schema.unevaluatedItems,
                                itemValidationResult,
                                matchingSchemas,
                                context
                            );
                            validationResult.mergePropertyMatch(itemValidationResult);
                        }
                    }
                    validationResult.processedProperties.add(String(i));
                    validationResult.propertiesValueMatches++;
                }
            }

            if (isNumber(schema.minItems) && node.items.length < schema.minItems) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    message: l10n.t('Array has too few items. Expected {0} or more.', schema.minItems)
                });
            }

            if (isNumber(schema.maxItems) && node.items.length > schema.maxItems) {
                validationResult.problems.push({
                    location: { offset: node.offset, length: node.length },
                    message: l10n.t('Array has too many items. Expected {0} or fewer.', schema.maxItems)
                });
            }

            if (schema.uniqueItems === true) {
                const values = ValidationUtil.getNodeValue(node);
                const duplicates = values.some((value: any, index: number) => {
                    return index !== values.lastIndexOf(value);
                });
                if (duplicates) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message: l10n.t('Array has duplicate items.')
                    });
                }
            }
        }

        function _validateObjectNode(node: ObjectASTNode): void {
            const seenKeys: { [key: string]: ASTNode | undefined } = Object.create(null);
            const unprocessedProperties: Set<string> = new Set();
            for (const propertyNode of node.properties) {
                const key = propertyNode.keyNode.value;
                seenKeys[key] = propertyNode.valueNode;
                unprocessedProperties.add(key);
            }

            if (Array.isArray(schema.required)) {
                for (const propertyName of schema.required) {
                    if (!seenKeys[propertyName]) {
                        const keyNode = node.parent && node.parent.type === 'property' && node.parent.keyNode;
                        const location = keyNode
                            ? { offset: keyNode.offset, length: keyNode.length }
                            : { offset: node.offset, length: 1 };
                        validationResult.problems.push({
                            location: location,
                            message: l10n.t('Missing property "{0}".', propertyName)
                        });
                    }
                }
            }

            const propertyProcessed = (prop: string) => {
                unprocessedProperties.delete(prop);
                validationResult.processedProperties.add(prop);
            };

            if (schema.properties) {
                for (const propertyName of Object.keys(schema.properties)) {
                    propertyProcessed(propertyName);
                    const propertySchema = schema.properties[propertyName];
                    const child = seenKeys[propertyName];
                    if (child) {
                        if (isBoolean(propertySchema)) {
                            if (!propertySchema) {
                                const propertyNode = <PropertyASTNode>child.parent;
                                validationResult.problems.push({
                                    location: {
                                        offset: propertyNode.keyNode.offset,
                                        length: propertyNode.keyNode.length
                                    },
                                    message: schema.errorMessage || l10n.t('Property {0} is not allowed.', propertyName)
                                });
                            } else {
                                validationResult.propertiesMatches++;
                                validationResult.propertiesValueMatches++;
                            }
                        } else {
                            const propertyValidationResult = new ValidationResult();
                            SchemaValidator.validate(
                                child,
                                propertySchema,
                                propertyValidationResult,
                                matchingSchemas,
                                context
                            );
                            validationResult.mergePropertyMatch(propertyValidationResult);
                        }
                    }
                }
            }

            if (schema.patternProperties) {
                for (const propertyPattern of Object.keys(schema.patternProperties)) {
                    const regex = extendedRegExp(propertyPattern);
                    if (regex) {
                        const processed = [];
                        for (const propertyName of unprocessedProperties) {
                            if (regex.test(propertyName)) {
                                processed.push(propertyName);
                                const child = seenKeys[propertyName];
                                if (child) {
                                    const propertySchema = schema.patternProperties[propertyPattern];
                                    if (isBoolean(propertySchema)) {
                                        if (!propertySchema) {
                                            const propertyNode = <PropertyASTNode>child.parent;
                                            validationResult.problems.push({
                                                location: {
                                                    offset: propertyNode.keyNode.offset,
                                                    length: propertyNode.keyNode.length
                                                },
                                                message:
                                                    schema.errorMessage ||
                                                    l10n.t('Property {0} is not allowed.', propertyName)
                                            });
                                        } else {
                                            validationResult.propertiesMatches++;
                                            validationResult.propertiesValueMatches++;
                                        }
                                    } else {
                                        const propertyValidationResult = new ValidationResult();
                                        SchemaValidator.validate(
                                            child,
                                            propertySchema,
                                            propertyValidationResult,
                                            matchingSchemas,
                                            context
                                        );
                                        validationResult.mergePropertyMatch(propertyValidationResult);
                                    }
                                }
                            }
                        }
                        processed.forEach(propertyProcessed);
                    }
                }
            }

            const additionalProperties = schema.additionalProperties;
            if (additionalProperties !== undefined) {
                for (const propertyName of unprocessedProperties) {
                    propertyProcessed(propertyName);
                    const child = seenKeys[propertyName];
                    if (child) {
                        if (additionalProperties === false) {
                            const propertyNode = <PropertyASTNode>child.parent;

                            validationResult.problems.push({
                                location: { offset: propertyNode.keyNode.offset, length: propertyNode.keyNode.length },
                                message: schema.errorMessage || l10n.t('Property {0} is not allowed.', propertyName)
                            });
                        } else if (additionalProperties !== true) {
                            const propertyValidationResult = new ValidationResult();
                            SchemaValidator.validate(
                                child,
                                additionalProperties,
                                propertyValidationResult,
                                matchingSchemas,
                                context
                            );
                            validationResult.mergePropertyMatch(propertyValidationResult);
                        }
                    }
                }
            }
            const unevaluatedProperties = schema.unevaluatedProperties;
            if (unevaluatedProperties !== undefined) {
                const processed = [];
                for (const propertyName of unprocessedProperties) {
                    if (!validationResult.processedProperties.has(propertyName)) {
                        processed.push(propertyName);
                        const child = seenKeys[propertyName];
                        if (child) {
                            if (unevaluatedProperties === false) {
                                const propertyNode = <PropertyASTNode>child.parent;

                                validationResult.problems.push({
                                    location: {
                                        offset: propertyNode.keyNode.offset,
                                        length: propertyNode.keyNode.length
                                    },
                                    message: schema.errorMessage || l10n.t('Property {0} is not allowed.', propertyName)
                                });
                            } else if (unevaluatedProperties !== true) {
                                const propertyValidationResult = new ValidationResult();
                                SchemaValidator.validate(
                                    child,
                                    unevaluatedProperties,
                                    propertyValidationResult,
                                    matchingSchemas,
                                    context
                                );
                                validationResult.mergePropertyMatch(propertyValidationResult);
                            }
                        }
                    }
                }
                processed.forEach(propertyProcessed);
            }

            if (isNumber(schema.maxProperties)) {
                if (node.properties.length > schema.maxProperties) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message: l10n.t('Object has more properties than limit of {0}.', schema.maxProperties)
                    });
                }
            }

            if (isNumber(schema.minProperties)) {
                if (node.properties.length < schema.minProperties) {
                    validationResult.problems.push({
                        location: { offset: node.offset, length: node.length },
                        message: l10n.t(
                            'Object has fewer properties than the required number of {0}',
                            schema.minProperties
                        )
                    });
                }
            }

            if (schema.dependentRequired) {
                for (const key in schema.dependentRequired) {
                    const prop = seenKeys[key];
                    const propertyDeps = schema.dependentRequired[key];
                    if (prop && Array.isArray(propertyDeps)) {
                        _validatePropertyDependencies(key, propertyDeps);
                    }
                }
            }
            if (schema.dependentSchemas) {
                for (const key in schema.dependentSchemas) {
                    const prop = seenKeys[key];
                    const propertyDeps = schema.dependentSchemas[key];
                    if (prop && isObject(propertyDeps)) {
                        _validatePropertyDependencies(key, propertyDeps);
                    }
                }
            }

            if (schema.dependencies) {
                for (const key in schema.dependencies) {
                    const prop = seenKeys[key];
                    if (prop) {
                        _validatePropertyDependencies(key, schema.dependencies[key]);
                    }
                }
            }

            const propertyNames = ValidationUtil.asSchema(schema.propertyNames);
            if (propertyNames) {
                for (const f of node.properties) {
                    const key = f.keyNode;
                    if (key) {
                        SchemaValidator.validate(
                            key,
                            propertyNames,
                            validationResult,
                            NoOpSchemaCollector.instance,
                            context
                        );
                    }
                }
            }

            function _validatePropertyDependencies(key: string, propertyDep: string[] | JSONSchemaRef) {
                if (Array.isArray(propertyDep)) {
                    for (const requiredProp of propertyDep) {
                        if (!seenKeys[requiredProp]) {
                            validationResult.problems.push({
                                location: { offset: node.offset, length: node.length },
                                message: l10n.t(
                                    'Object is missing property {0} required by property {1}.',
                                    requiredProp,
                                    key
                                )
                            });
                        } else {
                            validationResult.propertiesValueMatches++;
                        }
                    }
                } else {
                    const propertySchema = ValidationUtil.asSchema(propertyDep);
                    if (propertySchema) {
                        const propertyValidationResult = new ValidationResult();
                        SchemaValidator.validate(
                            node,
                            propertySchema,
                            propertyValidationResult,
                            matchingSchemas,
                            context
                        );
                        validationResult.mergePropertyMatch(propertyValidationResult);
                    }
                }
            }
        }
    }
}
