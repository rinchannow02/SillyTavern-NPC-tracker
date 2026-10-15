/**
 * @file global.d.ts
 * @description Ambient TypeScript type declarations for SillyTavern UI Extension environment.
 */

declare namespace SillyTavern {
    interface Context {
        accountStorage: any;
        chat: Array<any>;
        characters: Array<any>;
        groups: Array<any>;
        name1: string;
        name2: string;
        characterId?: number;
        groupId?: string;
        chatId?: string;
        getCurrentChatId: () => string;
        getRequestHeaders: () => Record<string, string>;
        reloadCurrentChat: () => Promise<void>;
        renameChat: (newChatId: string) => Promise<void>;
        saveSettingsDebounced: () => void;
        onlineStatus: string;
        maxContext: number;
        chatMetadata: Record<string, any>;
        saveMetadataDebounced: () => void;
        eventSource: {
            on: (event: string, handler: (...args: any[]) => void) => void;
            emit: (event: string, ...args: any[]) => Promise<void>;
        };
        event_types: Record<string, string>;
        eventTypes: Record<string, string>;
        extensionSettings: Record<string, any>;
        extensionPrompts: Record<string, any>;
        setExtensionPrompt: (
            id: string,
            prompt: string,
            position: number,
            depth: number,
            scan?: boolean,
            role?: number
        ) => void;
        saveChat: () => Promise<void>;
        saveMetadata: () => Promise<void>;
        generateQuietPrompt: (params: { quietPrompt: string; jsonSchema?: any }) => Promise<string>;
        generateRaw: (params: { prompt: string; systemPrompt?: string; jsonSchema?: any }) => Promise<string>;
        ConnectionManagerRequestService: {
            sendRequest: (profileId: string, prompt: string, maxTokens?: number, options?: any) => Promise<string>;
        };
        powerUserSettings: Record<string, any>;
        renderExtensionTemplateAsync: (
            extensionName: string,
            templateId: string,
            templateData?: Record<string, any>
        ) => Promise<string>;
        Popup: any;
        toastr: any;
    }

    interface Libs {
        lodash: any;
        localforage: {
            getItem: <T = any>(key: string) => Promise<T | null>;
            setItem: <T = any>(key: string, value: T) => Promise<T>;
            removeItem: (key: string) => Promise<void>;
        };
        DOMPurify: {
            sanitize: (dirty: string, options?: any) => string;
        };
        Handlebars: any;
        Fuse: any;
    }

    function getContext(): Context;
    const libs: Libs;
}

interface Window {
    SillyTavern: typeof SillyTavern;
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<any>;
    ST_NPC_Tracker?: {
        db: any;
        settings: any;
        createNpc: Function;
        getActiveContextNpcs: Function;
        queryAll: Function;
        exportJson: Function;
        importJson: Function;
    };
    toastr?: any;
    DOMPurify?: any;
}

declare const jQuery: any;
declare const $: any;