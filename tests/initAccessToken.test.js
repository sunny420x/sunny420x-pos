const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { context } = require('../middleware/tenant');
const { hashToken } = require('../middleware/password');

function loadMiddleware(query) {
    const sandbox = {
        module: { exports: {} },
        require(name) {
            if (name === '../database') return { auth: { query } };
            if (name === './tenant') return { context };
            if (name === './password') return { hashToken };
            throw new Error('Unexpected dependency: ' + name);
        }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../middleware/initAccessToken'), 'utf8'), sandbox);
    return sandbox.module.exports;
}
function response() {
    return { redirect(url) { this.location = url; }, clearCookie(name) { this.cleared = name; } };
}

test('missing token redirects without querying or reaching the route', () => {
    const middleware = loadMiddleware(() => assert.fail('Unexpected database query'));
    const res = response();
    middleware({ cookies: {} }, res, () => assert.fail('Route should be blocked'));
    assert.equal(res.location, '/login');
});

test('invalid or expired session clears cookie and blocks the route', () => {
    const middleware = loadMiddleware((sql, values, callback) => {
        assert.match(sql, /s.expires_at > NOW\(\)/);
        assert.equal(values[0], hashToken('invalid'));
        callback(null, []);
    });
    const res = response();
    middleware({ cookies: { access_token: 'invalid' } }, res, () => assert.fail('Route should be blocked'));
    assert.equal(res.cleared, 'access_token');
    assert.equal(res.location, '/login');
});

test('authenticated requests carry user and isolated company context into async work', async () => {
    const user = { id: 2, company_id: 7, username: 'demo' };
    const middleware = loadMiddleware((sql, values, callback) => callback(null, [user]));
    const req = { cookies: { access_token: 'valid' } };
    await new Promise((resolve, reject) => {
        middleware(req, response(), err => {
            if (err) return reject(err);
            setImmediate(() => {
                try {
                    assert.equal(req.user, user);
                    assert.equal(req.company_id, 7);
                    assert.equal(context.getStore().companyId, 7);
                    resolve();
                } catch (error) { reject(error); }
            });
        });
    });
    assert.equal(context.getStore(), undefined);
});

test('database failures reach Express error handling without entering the route', () => {
    const failure = new Error('Database unavailable');
    const middleware = loadMiddleware((sql, values, callback) => callback(failure));
    middleware({ cookies: { access_token: 'valid' } }, response(), err => assert.equal(err, failure));
});

test('public authentication routes are registered before the shared guard', () => {
    const source = fs.readFileSync(require.resolve('../app'), 'utf8');
    assert.ok(source.indexOf("app.use(require('./middleware/auth'))") < source.indexOf('app.use(initAccessToken)'));
    assert.ok(source.indexOf('app.use(initAccessToken)') < source.indexOf('//Controller'));
    assert.ok(!source.includes('req.cookies.access_token'));
    assert.ok(!source.includes('Promise.resolve([req.user])'));
});
