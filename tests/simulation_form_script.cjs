// Unit tests of the actual inline script. DOM and network boundaries are doubles.
// No browser, FormData serialization, Flask, database, or native engine is tested.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(process.argv[2], 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const formId = html.match(/<form\b[^>]*\bid="([^"]+)"/)[1];
const flush = () => new Promise(resolve => setImmediate(resolve));

function element(attributes = {}) {
    const listeners = {};
    return {
        style: {}, hidden: false, disabled: false, value: attributes.value || '',
        action: attributes.action, textContent: '', innerHTML: '', children: [],
        listeners,
        addEventListener(name, listener) {
            (listeners[name] ||= []).push(listener);
        },
        appendChild(child) { this.children.push(child); },
        dispatch(name) {
            for (const listener of listeners[name] || []) {
                listener.call(this, {preventDefault() {}});
            }
        },
    };
}

async function load({experiments = [{config_id: 17, name: 'Prior <run>', random_seed: 93}],
                     listFails = false} = {}) {
    const nodes = {};
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/g)) {
        const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)]
            .map(attribute => [attribute[1], attribute[2]]));
        if (attrs.id) nodes[attrs.id] = element(attrs);
    }
    // The existing select defaults to Fontana; model only the DOM surface used here.
    nodes['generator-type'].value = 'Fontana';
    const posts = [];
    const alerts = [];
    let response = {status: 'success', config_id: 18, experiment_name: 'New run', message: 'Done'};
    const document = {
        getElementById(id) { return nodes[id] || null; },
        createElement() { return element(); },
        addEventListener(name, listener) {
            assert.equal(name, 'DOMContentLoaded');
            listener();
        },
    };
    vm.runInNewContext(script, {
        document,
        FormData: class { constructor(form) { this.sourceForm = form; } },
        fetch(url, options) {
            if (url === '/list_experiments') {
                return Promise.resolve({ok: !listFails, json: () => Promise.resolve({experiments})});
            }
            assert.equal(url, '/run_simulation_form');
            posts.push(options);
            return Promise.resolve({json: () => Promise.resolve(response)});
        },
        alert(message) { alerts.push(message); },
        console,
    });
    await flush();
    return {nodes, posts, alerts, setResponse(value) { response = value; }};
}

(async () => {
    let passed = 0;
    const app = await load();
    const parent = app.nodes['recursive-parent-id'];
    const fresh = app.nodes['fresh-options'];
    assert.ok(fresh, 'fresh inputs must have one group that can be disabled');
    assert.equal(fresh.hidden, false);
    assert.equal(fresh.disabled, false);
    assert.equal(app.nodes['fontana-options'].style.display, 'block');
    passed++;

    app.nodes['generator-type'].value = 'BTree';
    app.nodes['generator-type'].dispatch('change');
    assert.equal(app.nodes['btree-options'].style.display, 'block');
    assert.equal(app.nodes['fontana-options'].style.display, 'none');
    app.nodes['generator-type'].value = 'from_file';
    app.nodes['generator-type'].dispatch('change');
    assert.equal(app.nodes['from-file-options'].style.display, 'block');
    assert.equal(app.nodes['btree-options'].style.display, 'none');
    passed++;

    parent.value = '17';
    parent.dispatch('change');
    assert.equal(fresh.hidden, true, 'seeded mode hides fresh generator inputs');
    assert.equal(fresh.disabled, true, 'seeded mode excludes fresh inputs and their validation');
    parent.value = '';
    parent.dispatch('change');
    assert.equal(fresh.hidden, false);
    assert.equal(fresh.disabled, false);
    assert.equal(app.nodes['generator-type'].value, 'from_file', 'returning to fresh preserves values');
    passed++;

    assert.equal(parent.children.length, 1);
    assert.equal(parent.children[0].value, 17);
    assert.equal(parent.children[0].textContent, 'Prior <run> (Seed: 93)');
    assert.equal(parent.children[0].innerHTML, '', 'experiment names must be text, not markup');
    passed++;

    const form = app.nodes[formId];
    assert.ok(form, 'unified form must exist');
    assert.equal(form.listeners.submit.length, 1);
    for (const parentId of ['', '17', '']) {
        parent.value = parentId;
        parent.dispatch('change');
        const before = app.posts.length;
        form.dispatch('submit');
        await flush();
        assert.equal(app.posts.length, before + 1, 'each submission sends one request');
        const post = app.posts.at(-1);
        assert.equal(post.method, 'POST');
        assert.equal(post.body.sourceForm, form, 'FormData receives the actual unified form');
    }
    assert.equal(app.nodes['summary-name'].textContent, 'New run');
    assert.equal(app.nodes['view-experiment-link'].href, '/view_experiment/18');
    assert.equal(app.nodes['loading-indicator'].style.display, 'none');
    passed++;

    const empty = await load({experiments: []});
    assert.equal(empty.nodes['recursive-parent-id'].children.length, 0);
    assert.equal(empty.nodes['fresh-options'].disabled, false);
    assert.ok(empty.nodes['parent-load-status'].textContent.includes('No previous experiments'));
    passed++;

    const failed = await load({listFails: true});
    assert.equal(failed.nodes['recursive-parent-id'].children.length, 0);
    assert.equal(failed.nodes['fresh-options'].disabled, false);
    assert.ok(failed.nodes['parent-load-status'].textContent.includes('could not be loaded'));
    failed.nodes[formId].dispatch('submit');
    await flush();
    assert.equal(failed.posts.length, 1, 'fresh submission still works after list failure');
    passed++;
    process.stdout.write(JSON.stringify({passed}));
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
