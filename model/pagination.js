const DEFAULT_PAGE_SIZE = 20;

function parsePage(value) {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1;
    const page = Number(value);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function createPagination(requestedPage, total, pageSize = DEFAULT_PAGE_SIZE) {
    const totalPages = Math.ceil(total / pageSize);
    const page = Math.min(parsePage(String(requestedPage)), Math.max(totalPages, 1));

    return {
        page,
        pageSize,
        offset: (page - 1) * pageSize,
        total,
        totalPages,
    };
}

module.exports = { createPagination, parsePage, DEFAULT_PAGE_SIZE };
