import '@gravity-ui/nodekit';

declare module '@gravity-ui/nodekit' {
    interface AppConfig {
        mcpApiUrl: string;
        mcpApiToken: string | undefined;
        mcpSchemaUrl: string;
        mcpExtraHeaders: Record<string, string>;
        mcpExcludedTags: string[];
        mcpApiVersion: string;
    }
}
