const net = require('net');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
const decoder = new TextDecoder("iso-8859-1");

// --- CONFIGURAÇÃO DO BANCO ---
// Tentamos limpar qualquer aspa ou espaço que o Koyeb possa injetar
const rawUrl = process.env.DATABASE_URL || "";
const cleanUrl = rawUrl.trim().replace(/^["'](.+)["']$/, '$1');

console.log("-----------------------------------------");
console.log("DIAGNÓSTICO DE BANCO:");
console.log("URL Bruta:", rawUrl);
console.log("URL Limpa:", cleanUrl ? "Configurada" : "VAZIA");
console.log("-----------------------------------------");

const pool = new Pool({
    connectionString: cleanUrl,
    ssl: { rejectUnauthorized: false }
});

// Endpoint SQL
app.post('/api/sql', async (req, res) => {
    const { query, params } = req.body;
    let client;
    try {
        if (!cleanUrl || cleanUrl === "base") {
            throw new Error("A DATABASE_URL está configurada incorretamente no painel do Koyeb (Valor lido: " + cleanUrl + ")");
        }
        client = await pool.connect();
        const result = await client.query(query, params || []);
        res.json({ success: true, rows: result.rows });
    } catch (err) {
        console.error("ERRO SQL:", err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

// Telnet Proxy
io.on('connection', (socket) => {
    let telnetClient = new net.Socket();
    socket.on('connect-telnet', (config) => {
        telnetClient.connect(config.port || 23, config.host, () => {
            socket.emit('status', 'Conectado via Proxy.');
        });
        telnetClient.on('data', (buffer) => {
            const cleanBuffer = Buffer.from(buffer.filter(b => b !== 255));
            if (cleanBuffer.length > 0) socket.emit('output', decoder.decode(cleanBuffer));
        });
        telnetClient.on('error', (err) => socket.emit('status', 'Erro: ' + err.message));
        telnetClient.on('close', () => socket.emit('status', 'Desconectado.'));
    });
    socket.on('input', (data) => {
        if (telnetClient && !telnetClient.destroyed) telnetClient.write(data + '\r\n');
    });
    socket.on('disconnect', () => { if(telnetClient) telnetClient.destroy(); });
});

app.get('/', (req, res) => res.send('MUD Backend + DB Online'));
server.listen(process.env.PORT || 8000, '0.0.0.0', () => console.log(`Server ON`));
