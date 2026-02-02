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

// Configuração do Banco com log de verificação
console.log("Iniciando conexão com:", process.env.DATABASE_URL ? "URL encontrada" : "URL AUSENTE");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Teste imediato de conexão com o banco
pool.query('SELECT NOW()', (err, res) => {
    if (err) console.error("ERRO CRÍTICO AO CONECTAR NO NEON:", err.message);
    else console.log("Conexão com Neon estabelecida com sucesso.");
});

app.get('/', (req, res) => res.send('MUD Backend + DB Online'));

app.post('/api/sql', async (req, res) => {
    const { query, params } = req.body;
    let client;
    try {
        client = await pool.connect();
        const result = await client.query(query, params || []);
        res.json({ success: true, rows: result.rows });
    } catch (err) {
        console.error("Erro na execução SQL:", err.message);
        // Retornamos o erro exato para o frontend mostrar no log
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (client) client.release();
    }
});

// Proxy Telnet
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
