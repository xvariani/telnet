const net = require('net');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg'); // Cliente do Banco de Dados
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json()); // Permite receber JSON no POST

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const decoder = new TextDecoder("iso-8859-1");
const PORT = process.env.PORT || 8000;

// CONEXÃO COM O BANCO DE DADOS
// Ele pega a senha automaticamente da variável DATABASE_URL que configuramos no Koyeb
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Necessário para Neon/AWS
});

// --- ROTA DE SQL GENÉRICA (O que você pediu) ---
// CUIDADO: Em produção real, validar isso é vital para evitar SQL Injection.
// Para seu uso pessoal, isso permite rodar qualquer coisa.
app.post('/api/sql', async (req, res) => {
    const { query, params } = req.body;
    
    if (!query) return res.status(400).json({ error: "Faltou a query SQL" });

    try {
        const client = await pool.connect();
        const result = await client.query(query, params || []);
        client.release();
        
        res.json({ 
            success: true, 
            rows: result.rows, 
            rowCount: result.rowCount 
        });
    } catch (err) {
        console.error("Erro SQL:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- SOCKET IO (MUD PROXY) ---
io.on('connection', (socket) => {
    let telnetClient = new net.Socket();

    socket.on('connect-telnet', (config) => {
        const port = config.port || 23;
        const host = config.host;
        console.log(`Conectando em ${host}:${port}...`);

        telnetClient.connect(port, host, () => {
            socket.emit('status', 'Conectado via Proxy.');
        });

        telnetClient.on('data', (buffer) => {
            // Remove IAC (Negociação Telnet) para limpar sujeira
            const cleanBuffer = Buffer.from(buffer.filter(b => b !== 255));
            if (cleanBuffer.length > 0) {
                socket.emit('output', decoder.decode(cleanBuffer));
            }
        });

        telnetClient.on('error', (err) => socket.emit('status', 'Erro: ' + err.message));
        telnetClient.on('close', () => socket.emit('status', 'Desconectado.'));
    });

    socket.on('input', (data) => {
        if (telnetClient && !telnetClient.destroyed) {
            telnetClient.write(data + '\r\n');
        }
    });

    socket.on('heartbeat', () => socket.emit('heartbeat-ack'));
    socket.on('disconnect', () => { if(telnetClient) telnetClient.destroy(); });
});

// Inicialização: Cria a tabela se não existir (apenas para facilitar sua vida)
pool.query(`
    CREATE TABLE IF NOT EXISTS user_config (
        id SERIAL PRIMARY KEY, 
        profile_name TEXT UNIQUE, 
        data JSONB
    );
`).catch(err => console.log("Erro ao criar tabela inicial:", err));

app.get('/', (req, res) => res.send('MUD Backend + DB Online'));
server.listen(PORT, '0.0.0.0', () => console.log(`Rodando na porta ${PORT}`));
