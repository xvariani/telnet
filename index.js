const net = require('net');
const http = require('http');
const { Server } = require('socket.io');

const app = require('express')();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Tradutor de caracteres nativo do Node.js
const decoder = new TextDecoder("iso-8859-1"); 

const PORT = process.env.PORT || 8000;

io.on('connection', (socket) => {
    let telnetClient = new net.Socket();

    socket.on('connect-telnet', (config) => {
        telnetClient.connect(config.port || 23, config.host, () => {
            socket.emit('status', 'Conectado!');
        });

        telnetClient.on('data', (data) => {
            // A MÁGICA ACONTECE AQUI: 
            // Converte os bytes brutos do MUD para o texto correto com acentos
            const cleanText = decoder.decode(data);
            socket.emit('output', cleanText);
        });

        telnetClient.on('error', (err) => socket.emit('status', 'Erro: ' + err.message));
        telnetClient.on('close', () => socket.emit('status', 'Desconectado'));
    });

    socket.on('input', (data) => {
        if (telnetClient && telnetClient.writable) {
            // Envia o comando para o MUD
            telnetClient.write(data + '\n');
        }
    });

    socket.on('disconnect', () => telnetClient.destroy());
});

app.get('/', (req, res) => res.send('Proxy MUD Ativo e Corrigido'));
server.listen(PORT, '0.0.0.0', () => console.log(`Rodando na porta ${PORT}`));
