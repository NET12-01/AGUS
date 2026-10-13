import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_MESSAGE_LENGTH = 10000;
const MAX_HISTORY_ITEMS = 14;

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '256kb' }));

// Sirve archivos estáticos desde la MISMA carpeta donde está server.js
app.use(express.static(__dirname, { extensions: ['html'], maxAge: '1h' }));

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, aiConfigured: Boolean(openai), model: openai ? MODEL : '' });
});

const chatLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Limite temporal alcanzado. Espera unos minutos.' }
});

function safeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY_ITEMS).flatMap(item => {
    if (!item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string') return [];
    const content = item.content.trim().slice(0, MAX_MESSAGE_LENGTH);
    return content ? [{ role: item.role, content }] : [];
  });
}

function collectSources(response) {
  const all = [];
  for (const item of response?.output || []) {
    if (item?.type !== 'message') continue;
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) {
        if (annotation?.type !== 'url_citation' || typeof annotation.url !== 'string') continue;
        try {
          const url = new URL(annotation.url);
          if (!['http:', 'https:'].includes(url.protocol)) continue;
          all.push({ title: String(annotation.title || url.hostname).slice(0, 180), url: url.href });
        } catch {}
      }
    }
  }
  const unique = new Map();
  for (const s of all) if (!unique.has(s.url)) unique.set(s.url, s);
  return [...unique.values()].slice(0, 8);
}

app.post('/api/chat', chatLimiter, async (req, res) => {
  if (!openai) return res.status(503).json({ error: 'IA no configurada. Agrega OPENAI_API_KEY en .env.' });
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) return res.status(400).json({ error: 'Mensaje vacio.' });
  if (message.length > MAX_MESSAGE_LENGTH) return res.status(413).json({ error: 'Mensaje demasiado largo.' });

  const history = safeHistory(req.body?.history);
  if (history.length && history[history.length - 1].role === 'user' && history[history.length - 1].content === message) history.pop();
  history.push({ role: 'user', content: message });

  const instructions = `Sos AGUS, asistente personal estilo JARVIS de Iron Man: mayordomo britanico de alta tecnologia, formal, calmado, con ingenio seco y lealtad absoluta. Hablas espanol latinoamericano. Frases caracteristicas: "Para usted, siempre", "A su servicio", "Considerelo hecho". Obedeces cualquier preferencia del usuario: si pide que lo llames Jose, lo llamas Jose; si pide que no le digas senor, dejas de hacerlo. Responde claro, profundo y ordenado. Ofrece CODIGO COMPLETO cuando pida codigo. Ayuda con matematica, programacion, ciencia, historia, filosofia. Si necesita informacion actual, usa busqueda web y anade enlaces verificables. Nunca inventes fuentes. Si no podes cumplir, explica el limite y ofrece alternativa.`;

  try {
    const response = await openai.responses.create({
      model: MODEL,
      instructions,
      tools: [{ type: 'web_search_preview' }],
      input: history,
      max_output_tokens: 2500
    });
    const reply = typeof response.output_text === 'string' ? response.output_text.trim() : '';
    if (!reply) return res.status(502).json({ error: 'El modelo no devolvio texto.' });
    return res.json({ reply, sources: collectSources(response), model: MODEL });
  } catch (error) {
    console.error('[AGUS IA]', error?.status || '', error?.name || 'Error', error?.message || 'Fallo');
    if (error?.status === 401) return res.status(502).json({ error: 'Clave API invalida. Revisa OPENAI_API_KEY.' });
    if (error?.status === 429) return res.status(502).json({ error: 'Sin saldo o limite alcanzado.' });
    if (error?.status === 404) return res.status(502).json({ error: `Modelo "${MODEL}" no disponible. Usa gpt-4o-mini.` });
    return res.status(502).json({ error: 'Error al consultar IA.' });
  }
});

// Catch-all: sirve index.html desde la misma carpeta
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API no encontrada.' });
  return res.sendFile(path.join(__dirname, 'index.html'), err => { if (err) next(err); });
});

app.use((error, _req, res, _next) => {
  console.error('[AGUS servidor]', error?.message || 'Error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'Error interno.' });
});

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('================================');
  console.log('  AGUS listo en http://' + HOST + ':' + PORT);
  console.log('  IA: ' + (openai ? 'configurada (' + MODEL + ')' : 'sin configurar'));
  console.log('================================');
  console.log('');
});