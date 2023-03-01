import { DiagnosticSeverity, ErrorCode } from 'vscode-json-languageservice';
import * as l10n from '@vscode/l10n';

export interface IProblem {
    location: IRange;
    severity?: DiagnosticSeverity;
    code?: ErrorCode;
    message: string;
}

export interface IRange {
    offset: number;
    length: number;
}

export class ValidationResult {
    public problems: IProblem[];

    public propertiesMatches: number;
    public processedProperties: Set<string>;
    public propertiesValueMatches: number;
    public primaryValueMatches: number;
    public enumValueMatch: boolean;
    public enumValues: any[] | undefined;

    constructor() {
        this.problems = [];
        this.propertiesMatches = 0;
        this.processedProperties = new Set();
        this.propertiesValueMatches = 0;
        this.primaryValueMatches = 0;
        this.enumValueMatch = false;
        this.enumValues = undefined;
    }

    public hasProblems(): boolean {
        return !!this.problems.length;
    }

    public merge(validationResult: ValidationResult): void {
        this.problems = this.problems.concat(validationResult.problems);
        this.propertiesMatches += validationResult.propertiesMatches;
        this.propertiesValueMatches += validationResult.propertiesValueMatches;
        this.mergeProcessedProperties(validationResult);
    }

    public mergeEnumValues(validationResult: ValidationResult): void {
        if (
            !this.enumValueMatch &&
            !validationResult.enumValueMatch &&
            this.enumValues &&
            validationResult.enumValues
        ) {
            this.enumValues = this.enumValues.concat(validationResult.enumValues);
            for (const error of this.problems) {
                if (error.code === ErrorCode.EnumValueMismatch) {
                    error.message = l10n.t(
                        'Value is not accepted. Valid values: {0}.',
                        this.enumValues.map((v) => JSON.stringify(v)).join(', ')
                    );
                }
            }
        }
    }

    public mergePropertyMatch(propertyValidationResult: ValidationResult): void {
        this.problems = this.problems.concat(propertyValidationResult.problems);
        this.propertiesMatches++;
        if (
            propertyValidationResult.enumValueMatch ||
            (!propertyValidationResult.hasProblems() && propertyValidationResult.propertiesMatches)
        ) {
            this.propertiesValueMatches++;
        }
        if (
            propertyValidationResult.enumValueMatch &&
            propertyValidationResult.enumValues &&
            propertyValidationResult.enumValues.length === 1
        ) {
            this.primaryValueMatches++;
        }
    }

    public mergeProcessedProperties(validationResult: ValidationResult): void {
        validationResult.processedProperties.forEach((p) => this.processedProperties.add(p));
    }

    public compare(other: ValidationResult): number {
        const hasProblems = this.hasProblems();
        if (hasProblems !== other.hasProblems()) {
            return hasProblems ? -1 : 1;
        }
        if (this.enumValueMatch !== other.enumValueMatch) {
            return other.enumValueMatch ? -1 : 1;
        }
        if (this.primaryValueMatches !== other.primaryValueMatches) {
            return this.primaryValueMatches - other.primaryValueMatches;
        }
        if (this.propertiesValueMatches !== other.propertiesValueMatches) {
            return this.propertiesValueMatches - other.propertiesValueMatches;
        }
        return this.propertiesMatches - other.propertiesMatches;
    }
}
