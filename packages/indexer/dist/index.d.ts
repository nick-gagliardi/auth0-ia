type BuildIndexOptions = {
    repoUrl: string;
    ref: string;
    workdir: string;
    outDir: string;
};
export declare function buildIndex(opts: BuildIndexOptions): Promise<void>;
export {};
