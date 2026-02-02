const net = require('net');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Aumentado para suportar muitos bots

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const decoder = new TextDecoder("iso-8859-1");
const PORT = process.env.PORT || 8000;

// Conexão com o Banco de Dados (Configurado via Variável de Ambiente no Koyeb)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Rota SQL com LOG de erro detalhado para o painel do Koyeb
app.post('/api/sql', async (req, res) => {
    const { query, params } = req.body;
    try {
        const client = await pool.connect();
        const result = await client.query(query, params || []);
        client.release();
        res.json({ success: true, rows: result.rows });
    } catch (err) {
        console.error("ERRO NO BANCO DE DADOS:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Inicialização da Tabela
pool.query(`
    CREATE TABLE IF NOT EXISTS user_config (
        id SERIAL PRIMARY KEY, 
        profile_name TEXT UNIQUE, 
        data JSONB
    );
`).then(() => console.log("Tabela user_config verificada/criada.")).catch(e => console.error("Erro ao criar tabela:", e));

// Socket.io (Túnel Telnet)
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

server.listen(PORT, '0.0.0.0', () => console.log(`Server ON na porta ${PORT}`));
