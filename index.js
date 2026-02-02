const net = require('net');
const http = require('http');
const { Server } = require('socket.io');
const app = require('express')();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Decoder para ISO-8859-1 (Acentos corretos)
const decoder = new TextDecoder("iso-8859-1");

const PORT = process.env.PORT || 8000;

io.on('connection', (socket) => {
    let telnetClient = new net.Socket();

    socket.on('connect-telnet', (config) => {
        const port = config.port || 23;
        const host = config.host;

        console.log(`Conectando em ${host}:${port}...`);

        telnetClient.connect(port, host, () => {
            socket.emit('status', 'Conexão estabelecida.');
            // REMOVI O ENTER AUTOMÁTICO QUE ESTAVA CAUSANDO O ERRO DE NOME
        });

        telnetClient.on('data', (buffer) => {
            // Filtra negociação Telnet (IAC) para não sujar o terminal
            const cleanBuffer = Buffer.from(buffer.filter(b => b !== 255));
            if (cleanBuffer.length > 0) {
                const text = decoder.decode(cleanBuffer);
                socket.emit('output', text);
            }
        });

        telnetClient.on('error', (err) => {
            socket.emit('status', 'Erro: ' + err.message);
        });

        telnetClient.on('close', () => {
            socket.emit('status', 'Desconectado.');
        });
    });

    socket.on('input', (data) => {
        if (telnetClient && !telnetClient.destroyed) {
            // Envia o comando com Enter (\r\n) padrão Telnet
            telnetClient.write(data + '\r\n');
        }
    });

    // Mantém o Koyeb acordado
    socket.on('heartbeat', () => socket.emit('heartbeat-ack'));

    socket.on('disconnect', () => {
        if(telnetClient) telnetClient.destroy();
    });
});

app.get('/', (req, res) => res.send('MUD Proxy v5 Stable'));
server.listen(PORT, '0.0.0.0', () => console.log(`Rodando na porta ${PORT}`));
