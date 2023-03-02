export class ArrayUtils {
    public static isDifferent<T>(arr1: Array<T>, arr2: Array<T>): boolean {
        //calc symmetric difference of two arrays
        const diff = arr1.filter((elem) => !arr2.includes(elem)).concat(arr2.filter((elem) => !arr1.includes(elem)));
        return !!diff.length;
    }

    public static hasIntersection<T>(arr1: Array<T>, arr2: Array<T>): boolean {
        const intersection = arr1.filter((elem) => arr2.includes(elem));
        return !!intersection.length;
    }
}
