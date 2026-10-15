import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImport, importDatabaseFromJson, getNpcById, DEFAULT_BLOCKS } from '../src/db/sqlite-store.js';
import { formatActiveNpcsPrompt } from '../src/injection.js';

test('validateImport - valid payload succeeds', () => {
    const validPayload = {
        version: 1,
        exported_at: new Date().toISOString(),
        npcs: [
            {
                id: '12345678-1234-1234-1234-123456789abc',
                name: 'Valid NPC',
                aliases: 'Ally, Pal',
                avatar: '',
                group_name: 'Guild',
                location_keywords: 'tavern',
                template_mode: 'basic',
                blocks_json: JSON.stringify([
                    { id: 'appearance', label: 'Appearance', value: 'Tall and slender' },
                    { id: 'personality', label: 'Personality', value: 'Friendly' },
                ]),
                raw_content: '',
                injection_position: 1,
                injection_depth: 4,
                injection_role: 0,
                created_at: Date.now(),
                updated_at: Date.now(),
            },
        ],
        npc_links: [
            {
                id: 1,
                npc_id: '12345678-1234-1234-1234-123456789abc',
                scope_type: 'chat',
                target_id: 'chat_123',
                relationship_summary: 'Ally',
                is_active: 1,
                created_at: Date.now(),
            },
        ],
    };

    assert.doesNotThrow(() => validateImport(validPayload));
});

test('validateImport - rejects bad NPC id (e.g. XSS payload)', () => {
    const badIdPayload = {
        npcs: [
            {
                id: 'x"><img src=x onerror=alert(1)>',
                name: 'Injected NPC',
            },
        ],
        npc_links: [],
    };

    assert.throws(
        () => validateImport(badIdPayload),
        /Invalid NPC id/
    );
});

test('validateImport - rejects bad link npc_id', () => {
    const badLinkNpcIdPayload = {
        npcs: [
            {
                id: '12345678-1234-1234-1234-123456789abc',
                name: 'Valid NPC',
            },
        ],
        npc_links: [
            {
                npc_id: 'x"><img src=x onerror=alert(1)>',
                scope_type: 'global',
                target_id: 'global',
            },
        ],
    };

    assert.throws(
        () => validateImport(badLinkNpcIdPayload),
        /Invalid link npc_id/
    );
});

test('validateImport - rejects bad scope_type', () => {
    const badScopePayload = {
        npcs: [
            {
                id: '12345678-1234-1234-1234-123456789abc',
                name: 'Valid NPC',
            },
        ],
        npc_links: [
            {
                npc_id: '12345678-1234-1234-1234-123456789abc',
                scope_type: 'invalid_scope',
                target_id: 'target_123',
            },
        ],
    };

    assert.throws(
        () => validateImport(badScopePayload),
        /Invalid link scope_type/
    );
});

test('validateImport - rejects malformed blocks_json', () => {
    const malformedJsonPayload = {
        npcs: [
            {
                id: '12345678-1234-1234-1234-123456789abc',
                name: 'Bad Blocks NPC',
                blocks_json: 'not valid json {{{',
            },
        ],
    };

    assert.throws(
        () => validateImport(malformedJsonPayload),
        /Malformed NPC blocks_json/
    );

    const badBlocksArrayPayload = {
        npcs: [
            {
                id: '12345678-1234-1234-1234-123456789abc',
                name: 'Bad Blocks NPC',
                blocks_json: JSON.stringify([{ id: 'test', label: 123 }]),
            },
        ],
    };

    assert.throws(
        () => validateImport(badBlocksArrayPayload),
        /Invalid block at index/
    );
});

const ID = '32345678-1234-1234-1234-123456789abc';

test('validateImport - rejects non-string aliases (R4)', () => {
    assert.throws(
        () => validateImport({ npcs: [{ id: ID, name: 'A', aliases: ['x'] }] }),
        /Invalid NPC aliases/
    );
});

test('import ignores unvalidated npcs[].links and npcs[].blocks (R4, R6)', async () => {
    await importDatabaseFromJson(JSON.stringify({
        npcs: [{ id: ID, name: 'A', links: [{ scope_type: 'evil', target_id: 'x' }], blocks: [{ id: 1 }] }],
    }));
    const npc = getNpcById(ID);
    assert.deepEqual(npc.links, []);
    assert.deepEqual(npc.blocks, DEFAULT_BLOCKS.map((b) => ({ ...b })));
    assert.ok(Object.isFrozen(DEFAULT_BLOCKS[0]));
});

test('formatActiveNpcsPrompt keeps $ patterns literal (R5)', () => {
    const out = formatActiveNpcsPrompt([{ name: "Bob $' $&", blocks: [] }], 'HEAD {{npcs}} TAIL');
    assert.equal(out, "HEAD ### NPC: Bob $' $& TAIL");
});
