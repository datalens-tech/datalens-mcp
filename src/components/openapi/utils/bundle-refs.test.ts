import {describe, expect, it} from 'vitest';

import type {JsonSchema} from '../types';

import {bundleRefs} from './bundle-refs';

describe('bundleRefs', () => {
    it('bundles a wide reference graph within a linear node budget', () => {
        const count = 1000;
        const components: Record<string, JsonSchema> = {};
        const refs = [];
        for (let i = 0; i < count; i++) {
            const name = `Component${i}`;
            components[name] = {
                type: 'object',
                properties: {next: {$ref: `#/components/schemas/Component${(i + 1) % count}`}},
            };
            refs.push({$ref: `#/components/schemas/${name}`});
        }
        const result = bundleRefs({allOf: refs}, components, {remainingNodes: 10 * count});
        expect(Object.keys(result.$defs as object)).toHaveLength(count);
        expect(
            (result.$defs as Record<string, JsonSchema>).Component999.properties?.next.$ref,
        ).toBe('#/$defs/Component0');
    });

    it('shares the materialization budget across command schemas', () => {
        const budget = {remainingNodes: 6};
        const components = {Shared: {type: 'object', properties: {id: {type: 'string'}}}};
        const root = {$ref: '#/components/schemas/Shared'};
        expect(bundleRefs(root, components, budget).$defs).toEqual(components);
        expect(() => bundleRefs(root, components, budget)).toThrow('maximum allowed complexity');
    });
    it('returns the schema untouched when no components are provided', () => {
        const schema: JsonSchema = {$ref: '#/components/schemas/Foo'};
        expect(bundleRefs(schema, undefined)).toEqual(schema);
    });

    it('leaves a schema without refs unchanged and adds no $defs', () => {
        const schema: JsonSchema = {type: 'object', properties: {id: {type: 'string'}}};
        const result = bundleRefs(schema, {});
        expect(result).toEqual(schema);
        expect(result.$defs).toBeUndefined();
    });

    it('rewrites a $ref to #/$defs/ and bundles the referenced component', () => {
        const components: Record<string, JsonSchema> = {
            Foo: {type: 'object', properties: {name: {type: 'string'}}},
        };
        const schema: JsonSchema = {
            type: 'object',
            properties: {foo: {$ref: '#/components/schemas/Foo'}},
        };

        const result = bundleRefs(schema, components);

        expect((result.properties as Record<string, JsonSchema>).foo).toEqual({
            $ref: '#/$defs/Foo',
        });
        expect(result.$defs).toEqual({Foo: components.Foo});
    });

    it('bundles transitively referenced components', () => {
        const components: Record<string, JsonSchema> = {
            Foo: {type: 'object', properties: {bar: {$ref: '#/components/schemas/Bar'}}},
            Bar: {type: 'object', properties: {value: {type: 'number'}}},
            Unused: {type: 'string'},
        };
        const schema: JsonSchema = {$ref: '#/components/schemas/Foo'};

        const result = bundleRefs(schema, components);
        const defs = result.$defs as Record<string, JsonSchema>;

        expect(Object.keys(defs).sort()).toEqual(['Bar', 'Foo']);
        expect((defs.Foo.properties as Record<string, JsonSchema>).bar).toEqual({
            $ref: '#/$defs/Bar',
        });
    });

    it('represents a self-referential (cyclic) schema without infinite recursion', () => {
        const components: Record<string, JsonSchema> = {
            Node: {
                type: 'object',
                properties: {child: {$ref: '#/components/schemas/Node'}},
            },
        };
        const schema: JsonSchema = {$ref: '#/components/schemas/Node'};

        const result = bundleRefs(schema, components);
        const defs = result.$defs as Record<string, JsonSchema>;

        expect(result.$ref).toBe('#/$defs/Node');
        expect((defs.Node.properties as Record<string, JsonSchema>).child).toEqual({
            $ref: '#/$defs/Node',
        });
    });

    it('emits a stub def for a reference with no matching component', () => {
        const schema: JsonSchema = {$ref: '#/components/schemas/Missing'};

        const result = bundleRefs(schema, {});
        const defs = result.$defs as Record<string, JsonSchema>;

        expect(result.$ref).toBe('#/$defs/Missing');
        expect(defs.Missing.type).toBe('object');
        expect(defs.Missing.description).toContain('Unresolved reference: Missing');
    });

    it('rewrites refs inside a discriminator mapping and bundles their components', () => {
        const components: Record<string, JsonSchema> = {
            Dog: {type: 'object', properties: {bark: {type: 'boolean'}}},
            Cat: {type: 'object', properties: {meow: {type: 'boolean'}}},
        };
        const schema: JsonSchema = {
            oneOf: [{$ref: '#/components/schemas/Dog'}, {$ref: '#/components/schemas/Cat'}],
            discriminator: {
                propertyName: 'kind',
                mapping: {
                    dog: '#/components/schemas/Dog',
                    cat: '#/components/schemas/Cat',
                },
            },
        };

        const result = bundleRefs(schema, components);
        const discriminator = result.discriminator as {
            mapping: Record<string, string>;
            propertyName: string;
        };

        expect(discriminator.mapping).toEqual({
            dog: '#/$defs/Dog',
            cat: '#/$defs/Cat',
        });
        expect(discriminator.propertyName).toBe('kind');
        expect(Object.keys(result.$defs as Record<string, JsonSchema>).sort()).toEqual([
            'Cat',
            'Dog',
        ]);
    });

    it('bundles a component only referenced from a discriminator mapping', () => {
        const components: Record<string, JsonSchema> = {
            Variant: {type: 'object', properties: {value: {type: 'string'}}},
        };
        const schema: JsonSchema = {
            discriminator: {mapping: {variant: '#/components/schemas/Variant'}},
        };

        const result = bundleRefs(schema, components);

        expect(result.$defs).toEqual({Variant: components.Variant});
    });

    it('rewrites refs nested inside arrays', () => {
        const components: Record<string, JsonSchema> = {
            Item: {type: 'object'},
        };
        const schema: JsonSchema = {
            type: 'array',
            items: {oneOf: [{$ref: '#/components/schemas/Item'}]},
        };

        const result = bundleRefs(schema, components);
        const items = result.items as JsonSchema;
        const oneOf = items.oneOf as JsonSchema[];

        expect(oneOf[0]).toEqual({$ref: '#/$defs/Item'});
        expect(result.$defs).toEqual({Item: components.Item});
    });
});
