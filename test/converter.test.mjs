import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksToTemplate, templateToBlocks } from '../src/ui/template-converter.js';

test('blocksToTemplate - converts blocks and metadata with tokens', () => {
    const npc = {
        name: 'Captain Vane',
        aliases: 'Vane, Pirate Captain',
        group_name: 'Crimson Fleet',
        location_keywords: 'Port Royal, Docks',
        blocks: [
            { id: 'appearance', label: 'Appearance', value: 'Weathered pirate with a scar across his jaw.' },
            { id: 'personality', label: 'Personality', value: 'Fiercely independent, loyal to his crew.' },
            { id: 'relationship', label: 'Relationship', value: 'Cautious business partner.' },
            { id: 'custom_weapons', label: 'Weapons', value: 'Cutlass and twin flintlocks.' },
        ],
    };

    const template = blocksToTemplate(npc, { useTokens: true });
    assert.match(template, /^### NPC: \{\{name\}\} \(\{\{aliases\}\}\) \[Group: \{\{group\}\}\]/);
    assert.match(template, /- \*\*Location\/Setting:\*\* \{\{location\}\}/);
    assert.match(template, /- \*\*Appearance:\*\* Weathered pirate with a scar across his jaw\./);
    assert.match(template, /- \*\*Personality:\*\* Fiercely independent, loyal to his crew\./);
    assert.match(template, /- \*\*Relationship:\*\* Cautious business partner\./);
    assert.match(template, /- \*\*Weapons:\*\* Cutlass and twin flintlocks\./);
});

test('blocksToTemplate - multiline values format cleanly', () => {
    const npc = {
        name: 'Sage Alistair',
        blocks: [
            { id: 'appearance', label: 'Appearance', value: 'Line 1\nLine 2\nLine 3' },
        ],
    };

    const template = blocksToTemplate(npc, { useTokens: true });
    assert.match(template, /- \*\*Appearance:\*\*\n  Line 1\n  Line 2\n  Line 3/);
});

test('templateToBlocks - parses standard markdown bullet list', () => {
    const markdown = `
### NPC: Eldrin the Wise (The Ancient) [Group: Circle of Magi]
- **Location/Setting:** High Tower, Arcane Archives
- **Appearance:** Elderly wizard with a starry blue robe.
- **Personality:** Patient and cryptic.
- **Relationship:** Friendly mentor.
- **Spellbook:** Contains high-tier evocation spells.
    `;

    const parsed = templateToBlocks(markdown);
    assert.equal(parsed.name, 'Eldrin the Wise');
    assert.equal(parsed.aliases, 'The Ancient');
    assert.equal(parsed.group_name, 'Circle of Magi');
    assert.equal(parsed.location_keywords, 'High Tower, Arcane Archives');
    assert.equal(parsed.metadataUpdated, true);

    const appearance = parsed.blocks.find((b) => b.id === 'appearance');
    const personality = parsed.blocks.find((b) => b.id === 'personality');
    const relationship = parsed.blocks.find((b) => b.id === 'relationship');
    const spellbook = parsed.blocks.find((b) => b.label === 'Spellbook');

    assert.equal(appearance?.value, 'Elderly wizard with a starry blue robe.');
    assert.equal(personality?.value, 'Patient and cryptic.');
    assert.equal(relationship?.value, 'Friendly mentor.');
    assert.equal(spellbook?.value, 'Contains high-tier evocation spells.');
});

test('templateToBlocks - parses markdown headers format', () => {
    const markdown = `
### NPC: Gareth

### Appearance
Tall knight clad in polished silver plate armor.
Carries a heavy kite shield.

### Personality
Honorable to a fault, speaks formally.

### Relationship
Sworn protector of the realm.
    `;

    const parsed = templateToBlocks(markdown);
    assert.equal(parsed.name, 'Gareth');

    const appearance = parsed.blocks.find((b) => b.id === 'appearance');
    const personality = parsed.blocks.find((b) => b.id === 'personality');
    const relationship = parsed.blocks.find((b) => b.id === 'relationship');

    assert.ok(appearance?.value.includes('Tall knight clad in polished silver plate armor.'));
    assert.ok(appearance?.value.includes('Carries a heavy kite shield.'));
    assert.equal(personality?.value, 'Honorable to a fault, speaks formally.');
    assert.equal(relationship?.value, 'Sworn protector of the realm.');
});

test('templateToBlocks - preserves existing standard blocks when empty or tokens present', () => {
    const currentNpc = {
        blocks: [
            { id: 'appearance', label: 'Appearance', value: 'Existing appearance' },
            { id: 'personality', label: 'Personality', value: 'Existing personality' },
            { id: 'relationship', label: 'Relationship', value: 'Existing relationship' },
        ],
    };

    const templateWithTokens = `
### NPC: {{name}} [Group: {{group}}]
- **Appearance:** {{appearance}}
- **Personality:** {{personality}}
- **Relationship:** {{relationship}}
    `;

    const parsed = templateToBlocks(templateWithTokens, currentNpc);
    assert.equal(parsed.metadataUpdated, false);
    // Preserves existing values since template only contained token placeholders
    const appearance = parsed.blocks.find((b) => b.id === 'appearance');
    assert.equal(appearance?.value, 'Existing appearance');
});

test('templateToBlocks - empty template produces standard blank blocks', () => {
    const parsed = templateToBlocks('');
    assert.equal(parsed.blocks.length, 3);
    assert.equal(parsed.blocks[0].id, 'appearance');
    assert.equal(parsed.blocks[1].id, 'personality');
    assert.equal(parsed.blocks[2].id, 'relationship');
});

test('templateToBlocks - captures unlabelled preamble text in Notes custom block', () => {
    const markdown = `
### NPC: Mystery Figure
A shadowy figure lurking by the docks, watching the ship manifest carefully.

- **Appearance:** Hooded cloak obscuring facial features.
- **Personality:** Taciturn.
    `;

    const parsed = templateToBlocks(markdown);
    const notes = parsed.blocks.find((b) => b.label === 'Notes');
    assert.ok(notes?.value.includes('A shadowy figure lurking by the docks'));
});

test('renderNpcSheet - interpolates block tokens and handles literal $ in template mode', async () => {
    const { renderNpcSheet } = await import('../src/injection.js');
    const npc = {
        name: 'Merchant Bob',
        template_mode: 'template',
        raw_content: '### {{name}}\nLooks: {{appearance}}\nSpecial: {{item_cost}}',
        blocks: [
            { id: 'appearance', label: 'Appearance', value: 'Wearing a rich $100 cloak' },
            { id: 'custom_cost', label: 'item_cost', value: '$50 per potion' },
        ],
    };

    const rendered = renderNpcSheet(npc);
    assert.equal(rendered, '### Merchant Bob\nLooks: Wearing a rich $100 cloak\nSpecial: $50 per potion');
});

test('getNpcGroupHierarchy - builds parent and sub-group hierarchy', async () => {
    const { getNpcGroupHierarchy, createNpc, deleteNpc } = await import('../src/db/sqlite-store.js');
    const id1 = createNpc({ name: 'Tech 1', group_name: 'Mirai Industries IT / Cybersecurity Division' });
    const id2 = createNpc({ name: 'Tech 2', group_name: 'Mirai Industries IT / Infrastructure Team' });
    const id3 = createNpc({ name: 'Bartender', group_name: 'Silvermoon Tavern' });
    const id4 = createNpc({ name: 'Waitress', group_name: 'Silvermoon Tavern / Staff' });

    try {
        const hierarchy = getNpcGroupHierarchy();
        const mirai = hierarchy.find((g) => g.name === 'Mirai Industries IT');
        const tavern = hierarchy.find((g) => g.name === 'Silvermoon Tavern');

        assert.ok(mirai);
        assert.deepEqual(mirai.subGroups, ['Cybersecurity Division', 'Infrastructure Team']);

        assert.ok(tavern);
        assert.deepEqual(tavern.subGroups, ['Staff']);
    } finally {
        deleteNpc(id1);
        deleteNpc(id2);
        deleteNpc(id3);
        deleteNpc(id4);
    }
});

test('template round-trip preserves all blocks across all BUILTIN_PRESETS without Notes collapse (C1)', async () => {
    const { BUILTIN_PRESETS } = await import('../src/templates/preset-manager.js');

    for (const preset of BUILTIN_PRESETS) {
        const originalBlocks = preset.blocks.map((b, i) => ({
            id: b.id,
            label: b.label,
            type: b.type || 'text',
            value: `Sample value for ${b.label} (${i})`,
        }));

        const originalNpc = {
            name: `Test NPC for ${preset.name}`,
            aliases: 'Tester',
            group_name: 'Guild / Squad',
            location_keywords: 'HQ',
            blocks: originalBlocks,
        };

        const markdown = blocksToTemplate(originalNpc, { useTokens: true });
        const parsed = templateToBlocks(markdown, originalNpc);

        // Verify no blocks collapsed into Notes
        const notesBlock = parsed.blocks.find((b) => b.label === 'Notes');
        assert.equal(notesBlock, undefined, `Preset ${preset.id} collapsed into Notes`);

        // Verify every original block ID is preserved with expected value
        for (const orig of originalBlocks) {
            const found = parsed.blocks.find((b) => b.id === orig.id);
            assert.ok(found, `Block id "${orig.id}" (${orig.label}) lost in preset ${preset.id}`);
            assert.equal(found.value, orig.value, `Value mismatch for block "${orig.id}" in preset ${preset.id}`);
        }
    }
});

test('editor confirm popup is routed through escaped askUserConfirm (S1, S2)', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const editorJs = fs.readFileSync(path.resolve('src/ui/editor.js'), 'utf-8');

    // Popup.show.confirm must only be called once in the entire file
    const confirmMatches = editorJs.match(/Popup\.show\.confirm\(/g);
    assert.equal(confirmMatches?.length, 1, 'Popup.show.confirm must only appear once in askUserConfirm');

    // Must be preceded by escapeHtml
    assert.ok(editorJs.includes('Popup.show.confirm(safeTitle, safeMessage)'));
});

test('evaluateSettingAwareTriggers clamps negative or invalid scan depth (I4)', async () => {
    const { evaluateSettingAwareTriggers } = await import('../src/scanner/chat-scanner.js');
    const testNpcs = [
        { name: 'Alice', location_keywords: 'library' },
        { name: 'Bob', location_keywords: 'tavern' },
    ];

    // Passing text string directly
    const resString = evaluateSettingAwareTriggers(testNpcs, 'the scene takes place at the library');
    assert.equal(resString.length, 1);
    assert.equal(resString[0].name, 'Alice');

    // Passing negative depth should not throw and safely fallback to active NPCs when chat is empty
    const resNegative = evaluateSettingAwareTriggers(testNpcs, -10);
    assert.equal(resNegative.length, 2);
});

test('evaluateSettingAwareTriggers honors scan depth window in context chat', async () => {
    const { evaluateSettingAwareTriggers } = await import('../src/scanner/chat-scanner.js');
    const testNpcs = [
        { name: 'Alice', location_keywords: 'library' },
        { name: 'Bob', location_keywords: 'tavern' },
    ];

    // Mock SillyTavern context chat with 5 messages
    globalThis.SillyTavern = {
        getContext: () => ({
            chat: [
                { mes: 'We arrive at the ancient library to read books.' }, // 5 msgs ago
                { mes: 'The weather is rainy.' },                           // 4 msgs ago
                { mes: 'We leave the street.' },                            // 3 msgs ago
                { mes: 'We entered the loud tavern.' },                     // 2 msgs ago
                { mes: 'The drinks are flowing.' },                         // 1 msg ago
            ],
        }),
    };

    // Depth 2: only scans last 2 messages ('loud tavern', 'drinks flowing') -> only Bob matches
    const depth2 = evaluateSettingAwareTriggers(testNpcs, 2);
    assert.equal(depth2.length, 1);
    assert.equal(depth2[0].name, 'Bob');

    // Depth 5: scans all 5 messages -> both Alice and Bob match
    const depth5 = evaluateSettingAwareTriggers(testNpcs, 5);
    assert.equal(depth5.length, 2);

    delete globalThis.SillyTavern;
});

test('syncPromptInjection respects general top-level settingAwareFilter and matchDepth without LLM scanner enabled', async () => {
    const { syncPromptInjection } = await import('../src/injection.js');
    let injectedPrompt = '';

    globalThis.SillyTavern = {
        getContext: () => ({
            chatId: 'test_chat',
            chatMetadata: {},
            chat: [
                { mes: 'We entered the loud tavern.' },
            ],
            setExtensionPrompt: (key, prompt) => {
                injectedPrompt = prompt;
            },
        }),
    };

    const activeNpcs = [
        { id: '1', name: 'Alice', location_keywords: 'library', template_mode: 'blocks', blocks: [] },
        { id: '2', name: 'Bob', location_keywords: 'tavern', template_mode: 'blocks', blocks: [] },
    ];

    // With settingAwareFilter: true and matchDepth: 5, scanner.enabled: false
    const settings = {
        enabled: true,
        settingAwareFilter: true,
        matchDepth: 5,
        scanner: { enabled: false },
    };

    syncPromptInjection(settings, activeNpcs);
    assert.ok(injectedPrompt.includes('Bob'), 'Bob should be injected');
    assert.ok(!injectedPrompt.includes('Alice'), 'Alice should not be injected when setting does not match');

    delete globalThis.SillyTavern;
});

test('chat-scanner salvage engine - captures novel keys and maps camelCase/fuzzy keys', async () => {
    const { scanRecentChat } = await import('../src/scanner/chat-scanner.js');
    const { getActiveContextNpcs } = await import('../src/db/sqlite-store.js');

    // Mock SillyTavern context with an extraction LLM response that includes novel and camelCase keys
    globalThis.SillyTavern = {
        getContext: () => ({
            chatId: 'salvage_chat',
            chatMetadata: {},
            chat: [{ mes: 'Hello world' }],
            generateRaw: async () => JSON.stringify([
                {
                    name: 'Salvage NPC',
                    speechStyle: 'Speaks in whispered riddles',
                    appearance: 'Silver hair and amber eyes',
                    combatWeapon: 'Dual vibrating daggers',
                    secretTies: 'Underground resistance informant',
                },
            ]),
            extensionSettings: {
                npc_tracker: {
                    enabled: true,
                    defaultScope: 'chat',
                    activeTemplateId: 'classic',
                    scanner: { enabled: true, scanDepth: 5 },
                },
            },
        }),
    };

    const result = await scanRecentChat({ scanDepth: 1 });
    assert.equal(result.created, 1);

    const npcs = getActiveContextNpcs();
    const createdNpc = npcs.find((n) => n.name === 'Salvage NPC');
    assert.ok(createdNpc, 'NPC must be created');

    // Fuzzy matching matched speechStyle to speech_style
    const speechBlock = createdNpc.blocks.find((b) => b.id === 'speech_style');
    assert.ok(speechBlock, 'speech_style block must exist');
    assert.equal(speechBlock.value, 'Speaks in whispered riddles');

    // Novel fields salvaged as custom blocks
    const weaponBlock = createdNpc.blocks.find((b) => b.id === 'custom_combatweapon');
    assert.ok(weaponBlock, 'combatWeapon must be salvaged into a custom block');
    assert.equal(weaponBlock.label, 'Combat Weapon');
    assert.equal(weaponBlock.value, 'Dual vibrating daggers');

    const tiesBlock = createdNpc.blocks.find((b) => b.id === 'custom_secretties');
    assert.ok(tiesBlock, 'secretTies must be salvaged into a custom block');
    assert.equal(tiesBlock.label, 'Secret Ties');
    assert.equal(tiesBlock.value, 'Underground resistance informant');

    delete globalThis.SillyTavern;
    delete globalThis.fetch;
});




test('index.js - scannerSettings is initialized before refreshPresetsUI or any references', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const indexJs = fs.readFileSync(path.resolve('index.js'), 'utf-8');

    const scannerSettingsDecl = indexJs.indexOf('const scannerSettings =');
    const refreshPresetsCall = indexJs.indexOf('refreshPresetsUI();');

    assert.ok(scannerSettingsDecl !== -1, 'scannerSettings must be declared in index.js');
    assert.ok(refreshPresetsCall !== -1, 'refreshPresetsUI() call must exist in index.js');
    assert.ok(
        scannerSettingsDecl < refreshPresetsCall,
        'scannerSettings must be declared before refreshPresetsUI() is invoked'
    );
});

test('deleteGroup & countNpcsInGroup - parent and sub-group deletion behavior', async () => {
    const { createNpc, deleteNpc, deleteGroup, countNpcsInGroup, getNpcById } = await import('../src/db/sqlite-store.js');

    const id1 = createNpc({ name: 'NPC 1', group_name: 'Mirai Industries IT' });
    const id2 = createNpc({ name: 'NPC 2', group_name: 'Mirai Industries IT / Cybersecurity Division' });
    const id3 = createNpc({ name: 'NPC 3', group_name: 'Mirai Industries IT / Infrastructure' });
    const id4 = createNpc({ name: 'NPC 4', group_name: 'Accounting Department' });

    try {
        // Test countNpcsInGroup
        assert.equal(countNpcsInGroup('Mirai Industries IT'), 3);
        assert.equal(countNpcsInGroup('Mirai Industries IT / Cybersecurity Division', true), 1);
        assert.equal(countNpcsInGroup('Accounting Department'), 1);
        assert.equal(countNpcsInGroup('Nonexistent Group'), 0);

        // Delete sub-group Cybersecurity Division
        const affectedSub = deleteGroup('Mirai Industries IT / Cybersecurity Division', true);
        assert.equal(affectedSub, 1);
        assert.equal(getNpcById(id2).group_name, 'Mirai Industries IT', 'Sub-group deletion should fallback to parent group');
        assert.equal(getNpcById(id3).group_name, 'Mirai Industries IT / Infrastructure', 'Other sub-group should remain untouched');

        // Delete parent group Mirai Industries IT
        const affectedParent = deleteGroup('Mirai Industries IT', false);
        assert.equal(affectedParent, 3);
        assert.equal(getNpcById(id1).group_name, '', 'Parent group deletion should clear group');
        assert.equal(getNpcById(id2).group_name, '', 'NPC fallen back to parent should be cleared');
        assert.equal(getNpcById(id3).group_name, '', 'Sub-groups under parent should be cleared');
        assert.equal(getNpcById(id4).group_name, 'Accounting Department', 'Unrelated group must remain untouched');
    } finally {
        deleteNpc(id1);
        deleteNpc(id2);
        deleteNpc(id3);
        deleteNpc(id4);
    }
});

test('sub-group addition under existing parent group produces valid hierarchy path', async () => {
    const { createNpc, deleteNpc, getNpcGroupHierarchy } = await import('../src/db/sqlite-store.js');

    const id1 = createNpc({ name: 'Hikari Chief', group_name: 'Hikari Co.' });
    try {
        const hierarchyBefore = getNpcGroupHierarchy();
        const hikariBefore = hierarchyBefore.find((g) => g.name === 'Hikari Co.');
        assert.ok(hikariBefore);
        assert.deepEqual(hikariBefore.subGroups, []);

        // Add an NPC with sub-group under existing parent
        const subGroupPath = `${hikariBefore.name} / Data Analyst`;
        const id2 = createNpc({ name: 'Hikari Analyst', group_name: subGroupPath });

        try {
            const hierarchyAfter = getNpcGroupHierarchy();
            const hikariAfter = hierarchyAfter.find((g) => g.name === 'Hikari Co.');
            assert.ok(hikariAfter);
            assert.deepEqual(hikariAfter.subGroups, ['Data Analyst']);
        } finally {
            deleteNpc(id2);
        }
    } finally {
        deleteNpc(id1);
    }
});

test('mergeNpcCollections - merges local and server databases without data loss', async () => {
    const { mergeNpcCollections } = await import('../src/db/sqlite-store.js');

    const npc1 = { id: 'uuid-1', name: 'Inue-san', updated_at: 100, created_at: 100 };
    const npc2 = { id: 'uuid-2', name: 'Haze (local)', updated_at: 150, created_at: 100 };
    const npc2Server = { id: 'uuid-2', name: 'Haze (server newer)', updated_at: 200, created_at: 100 };
    const npc3Server = { id: 'uuid-3', name: 'Wisdom', updated_at: 120, created_at: 120 };

    // 1. Mobile initial load (local empty, server has records)
    const mobileInit = mergeNpcCollections([], [npc1, npc2Server]);
    assert.equal(mobileInit.length, 2);
    assert.equal(mobileInit[0].name, 'Inue-san');

    // 2. Both sides have unique and conflicting records
    const merged = mergeNpcCollections([npc1, npc2], [npc2Server, npc3Server]);
    assert.equal(merged.length, 3);
    const haze = merged.find((n) => n.id === 'uuid-2');
    assert.equal(haze.name, 'Haze (server newer)', 'Newer timestamp must win conflict');
    assert.ok(merged.some((n) => n.id === 'uuid-3'), 'Unique server NPC must be merged');
    assert.ok(merged.some((n) => n.id === 'uuid-1'), 'Unique local NPC must be retained');
});

test('saveDatabaseNow - mirrors npcs to extensionSettings.server_db when serverSync is true', async () => {
    const { saveDatabaseNow, createNpc, deleteNpc } = await import('../src/db/sqlite-store.js');

    let savedDebouncedCalled = false;
    const testContext = {
        extensionSettings: {
            npc_tracker: {
                serverSync: true,
            },
        },
        saveSettingsDebounced: () => {
            savedDebouncedCalled = true;
        },
    };

    globalThis.SillyTavern = {
        getContext: () => testContext,
        libs: {
            localforage: {
                setItem: async () => {},
                getItem: async () => null,
            },
        },
    };

    const id = createNpc({ name: 'Sync Test NPC', group_name: 'Hikari Co.' });
    try {
        await saveDatabaseNow();
        const settings = globalThis.SillyTavern.getContext().extensionSettings.npc_tracker;
        assert.ok(savedDebouncedCalled, 'saveSettingsDebounced must be triggered');
        assert.ok(Array.isArray(settings.server_db), 'server_db must be an array');
        assert.ok(settings.server_db.some((n) => n.id === id), 'created NPC must exist in server_db');
        assert.ok(settings.server_db_updated_at > 0, 'server_db_updated_at must be populated');
    } finally {
        deleteNpc(id);
    }
});

test('initDatabase - hydrates from extensionSettings.server_db when local storage is empty', async () => {
    const { initDatabase, getNpcById } = await import('../src/db/sqlite-store.js');

    let seededItem = null;
    const serverNpc = {
        id: '11111111-2222-3333-4444-555555555555',
        name: 'Mobile Hydrated NPC',
        group_name: 'Hikari Co. / Accounting',
        blocks: [],
        links: [],
    };

    globalThis.SillyTavern = {
        getContext: () => ({
            extensionSettings: {
                npc_tracker: {
                    serverSync: true,
                    server_db: [serverNpc],
                },
            },
            saveSettingsDebounced: () => {},
        }),
        libs: {
            localforage: {
                getItem: async () => null, // empty local storage (like a new device)
                setItem: async (key, val) => {
                    seededItem = val;
                },
            },
        },
    };

    await initDatabase();
    const fetched = getNpcById(serverNpc.id);
    assert.ok(fetched, 'NPC from server_db must be loaded into memory');
    assert.equal(fetched.name, 'Mobile Hydrated NPC');
    assert.ok(Array.isArray(seededItem), 'localforage must be seeded with server NPCs');
    assert.ok(seededItem.some((n) => n.id === serverNpc.id), 'seeded localforage must contain server NPC');
});

