import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createItem,
  addItem,
  toggleItem,
  updateItem,
  deleteItem
} from '../js/app.js';

describe('Shopping List Operations', () => {
  it('creates an item with trimmed name and default unpurchased state', () => {
    const item = createItem('  Trái cây tươi  ');
    assert.equal(item.name, 'Trái cây tươi');
    assert.equal(item.purchased, false);
    assert.ok(item.id.startsWith('item_'));
    assert.equal(typeof item.createdAt, 'number');
    assert.equal(typeof item.updatedAt, 'number');
  });

  it('rejects empty or whitespace-only item names', () => {
    assert.throws(() => createItem(''), /không được để trống/);
    assert.throws(() => createItem('    '), /không được để trống/);
    assert.throws(() => createItem(null), /không được để trống/);
  });

  it('adds item to the front of list', () => {
    const initialList = [
      { id: '1', name: 'Item 1', purchased: false, createdAt: 10, updatedAt: 10 }
    ];
    const { items, addedItem } = addItem(initialList, 'Item 2');
    assert.equal(items.length, 2);
    assert.equal(items[0].id, addedItem.id);
    assert.equal(items[0].name, 'Item 2');
    assert.equal(items[1].name, 'Item 1');
  });

  it('toggles purchased state', () => {
    const initialList = [
      { id: '1', name: 'Gạo', purchased: false, createdAt: 10, updatedAt: 10 }
    ];
    const { items: list1, toggledItem: t1 } = toggleItem(initialList, '1');
    assert.equal(t1.purchased, true);
    assert.equal(list1[0].purchased, true);
    assert.ok(list1[0].updatedAt >= 10);

    const { items: list2, toggledItem: t2 } = toggleItem(list1, '1');
    assert.equal(t2.purchased, false);
    assert.equal(list2[0].purchased, false);
  });

  it('updates item name with trimmed input and rejects empty new name', () => {
    const initialList = [
      { id: '1', name: 'Cà phê', purchased: false, createdAt: 10, updatedAt: 10 }
    ];
    const { items, updatedItem } = updateItem(initialList, '1', '  Cà phê đen  ');
    assert.equal(updatedItem.name, 'Cà phê đen');
    assert.equal(items[0].name, 'Cà phê đen');
    assert.ok(items[0].updatedAt >= 10);

    assert.throws(() => updateItem(initialList, '1', '   '), /không được để trống/);
  });

  it('deletes item by id', () => {
    const initialList = [
      { id: '1', name: 'Item 1', purchased: false, createdAt: 10, updatedAt: 10 },
      { id: '2', name: 'Item 2', purchased: true, createdAt: 20, updatedAt: 20 }
    ];
    const { items, deletedItem } = deleteItem(initialList, '1');
    assert.equal(items.length, 1);
    assert.equal(items[0].id, '2');
    assert.equal(deletedItem.id, '1');
  });
});
