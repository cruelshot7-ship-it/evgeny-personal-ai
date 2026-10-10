import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { openDb } from "../src/db.js";
import { makeApi, pollOnce } from "../src/telegram.js";

/** Заглушка Bot API: отдаёт очередь обновлений и записывает все отправленные сообщения. */
function fakeTelegram(queue) {
  const sent = [];
  const calls = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const method = req.url.split("/").pop();
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ method, body });
      let result = true;
      if (method === "getUpdates") result = queue.splice(0, queue.length);
      if (method === "sendMessage") sent.push(body);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true, result }));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        sent,
        calls,
        close: () => new Promise((r) => server.close(r)),
      });
    }),
  );
}

const msg = (updateId, userId, text, name = "Ирина") => ({
  update_id: updateId,
  message: { text, chat: { id: Number(userId) }, from: { id: Number(userId), first_name: name } },
});

test("бот отвечает разрешённому пользователю и не отвечает чужому", async () => {
  const tg = await fakeTelegram([msg(1, 42, "/new Иванов Пётр | кухня"), msg(2, 99, "/list")]);
  try {
    const db = openDb(":memory:");
    const state = { offset: 0 };
    const call = makeApi("TEST", tg.base);
    const n = await pollOnce({ call, db, allowed: new Set(["42"]), state, timeout: 0 });
    assert.equal(n, 2);
    assert.equal(tg.sent.length, 2);
    assert.equal(tg.sent[0].chat_id, 42);
    assert.match(tg.sent[0].text, /Заказ №1 создан/);
    assert.equal(tg.sent[1].chat_id, 99);
    assert.match(tg.sent[1].text, /Нет доступа/);
  } finally {
    await tg.close();
  }
});

test("offset продвигается: одно сообщение не обрабатывается дважды", async () => {
  const tg = await fakeTelegram([msg(10, 42, "/list")]);
  try {
    const db = openDb(":memory:");
    const state = { offset: 0 };
    const call = makeApi("TEST", tg.base);
    await pollOnce({ call, db, allowed: new Set(["42"]), state, timeout: 0 });
    assert.equal(state.offset, 11);
    assert.equal(tg.calls[0].body.offset, 0);
    // второй опрос: очередь пуста, offset уходит дальше, ответов нет
    await pollOnce({ call, db, allowed: new Set(["42"]), state, timeout: 0 });
    const polls = tg.calls.filter((c) => c.method === "getUpdates");
    assert.equal(polls.at(-1).body.offset, 11);
    assert.equal(tg.sent.length, 1);
  } finally {
    await tg.close();
  }
});

test("пустой список доступа — никому не отвечаем по существу", async () => {
  const tg = await fakeTelegram([msg(1, 42, "/new Иванов Пётр")]);
  try {
    const db = openDb(":memory:");
    await pollOnce({ call: makeApi("TEST", tg.base), db, allowed: new Set(), state: { offset: 0 }, timeout: 0 });
    assert.match(tg.sent[0].text, /Нет доступа/);
    assert.equal(db.prepare("select count(*) as n from orders").get().n, 0, "заказ не создан");
  } finally {
    await tg.close();
  }
});

test("сообщения без текста (стикеры, фото) пропускаются молча", async () => {
  const tg = await fakeTelegram([{ update_id: 5, message: { chat: { id: 42 }, from: { id: 42 } } }]);
  try {
    const db = openDb(":memory:");
    const state = { offset: 0 };
    await pollOnce({ call: makeApi("TEST", tg.base), db, allowed: new Set(["42"]), state, timeout: 0 });
    assert.equal(tg.sent.length, 0);
    assert.equal(state.offset, 6);
  } finally {
    await tg.close();
  }
});
