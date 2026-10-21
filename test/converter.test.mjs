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
