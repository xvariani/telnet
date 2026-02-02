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
const PORT = process.env.PORT || 8000;

// Limpeza da URL para evitar o erro ENOTFOUND
const dbUrl = process.env.DATABASE_URL ? process.env.DATABASE_URL.trim().replace(/['"]/g, '') : null;

const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
});

// Log de diagnóstico no boot
console.log("Monitorando banco em:", dbUrl ? dbUrl.split('@')[1] : "URL NÃO ENCONTRADA");

app.post('/api/sql', async (req, res) => {
    const { query, params } = req.body;
    let client;
    try {
        if (!dbUrl) throw new Error("DATABASE_URL não configurada no Koyeb");
        client = await pool.connect();
        const result = await client.query(query, params || []);
        res.json({ success: true, rows: result.rows });
    } catch (err) {
        console.error("Erro SQL:", err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

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
server.listen(PORT, '0.0.0.0', () => console.log(`Server ON na porta ${PORT}`));
