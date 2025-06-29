// 全局状态变量，稍后在 program.parse 之后赋值
export let GLOBAL_VERBOSE = false;
export let GLOBAL_YES = false;
export function setGlobalVerbose(value) {
    GLOBAL_VERBOSE = value;
}
export function setGlobalYes(value) {
    GLOBAL_YES = value;
}
