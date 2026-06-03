export type Workspace = {
    cwd: string;
    inputRoot: string;
    projectBase: string;
    outputRoot: string;
    legacyProjectLayout: boolean;
};
export declare function discoverWorkspace(targetArg: string | null): Workspace;
export declare function isLeafmarkProject(dir: string): boolean;
