const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isConfigured, askAnthropic } = require('../lib/anthropic-copilot');

test('appelle Anthropic avec les indicateurs et les contacts du profil', async (t) => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = global.fetch;
  t.after(() => {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    global.fetch = previousFetch;
  });

  delete process.env.ANTHROPIC_API_KEY;
  assert.equal(isConfigured(), false);
  process.env.ANTHROPIC_API_KEY = 'cle-test';
  assert.equal(isConfigured(), true);

  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(options.headers['x-api-key'], 'cle-test');
    const body = JSON.parse(options.body);
    assert.match(body.system, /3 contacts à relancer/);
    assert.match(body.system, /Camille/);
    assert.equal(body.messages[0].content, 'Qui relancer ?');
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Relancez Camille.' }] }), { status: 200 });
  };
  assert.equal(await askAnthropic({ briefing: '3 contacts à relancer' }, [{ nom: 'Camille' }], 'Qui relancer ?'), 'Relancez Camille.');
});

test('refuse une erreur API ou une réponse vide sans fournir une réponse de démo', async (t) => {
  const previousKey = process.env.ANTHROPIC_API_KEY;
  const previousFetch = global.fetch;
  t.after(() => {
    if (previousKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousKey;
    global.fetch = previousFetch;
  });
  process.env.ANTHROPIC_API_KEY = 'cle-test';
  global.fetch = async () => new Response('Erreur externe', { status: 503 });
  await assert.rejects(askAnthropic({}, [], 'Résumé'), { status: 502 });
  global.fetch = async () => new Response(JSON.stringify({ content: [] }), { status: 200 });
  await assert.rejects(askAnthropic({}, [], 'Résumé'), { status: 502 });
});