const net = require('net');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');

const app = express();

// CONFIGURAÇÃO DE CORS REFORÇADA
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*", methods: ["GET", "POST"] } 
});

const decoder = new TextDecoder("iso-8859-1");
const PORT = process.env.PORT || 8000;

// Conexão com Banco (Blindada)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
});

// Rota de Teste (Para o navegador ver que está online)
app.get('/', (req, res) => res.send('MUD Backend + DB Online'));

// Rota SQL
app.post('/api/sql', async (req, res) => {
    const { query, params } = req.body;
    let client;
    try {
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

// Socket.io Telnet Proxy
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

// Tenta criar tabela mas não mata o processo se falhar
pool.query(`CREATE TABLE IF NOT EXISTS user_config (id SERIAL PRIMARY KEY, profile_name TEXT UNIQUE, data JSONB);`)
    .then(() => console.log("DB Ready"))
    .catch(e => console.error("DB Error on start:", e.message));

server.listen(PORT, '0.0.0.0', () => console.log(`Server ON na porta ${PORT}`));
