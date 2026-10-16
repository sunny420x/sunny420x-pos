const test = require('node:test');
const assert = require('node:assert/strict');
const { createPagination, parsePage } = require('../model/pagination');

test('parsePage defaults invalid and unsafe values to the first page', () => {
    for (const value of [undefined, '', '0', '-1', '1.5', '2abc', '9007199254740992']) {
        assert.equal(parsePage(value), 1);
    }
    assert.equal(parsePage('3'), 3);
});

test('createPagination calculates offsets and clamps past the last page', () => {
    assert.deepEqual(createPagination('2', 45), {
        page: 2,
        pageSize: 20,
        offset: 20,
        total: 45,
        totalPages: 3,
    });
    assert.deepEqual(createPagination('99', 45), {
        page: 3,
        pageSize: 20,
        offset: 40,
        total: 45,
        totalPages: 3,
    });
});

test('createPagination supports empty results without producing a negative offset', () => {
    assert.deepEqual(createPagination('4', 0), {
        page: 1,
        pageSize: 20,
        offset: 0,
        total: 0,
        totalPages: 0,
    });
});
