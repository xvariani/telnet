const net = require('net');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// O Koyeb define a porta automaticamente via variável de ambiente
const PORT = process.env.PORT || 8000;

io.on('connection', (socket) => {
    console.log('Novo cliente conectado via Web');
    let telnetClient = new net.Socket();

    // Evento para conectar ao equipamento Telnet
    socket.on('connect-telnet', (config) => {
        // config = { host: 'xxx.xxx.xxx.xxx', port: 23 }
        telnetClient.connect(config.port || 23, config.host, () => {
            socket.emit('status', 'Conectado com sucesso ao equipamento!');
        });

        telnetClient.on('data', (data) => {
            socket.emit('output', data.toString());
        });

        telnetClient.on('error', (err) => {
            socket.emit('status', 'Erro: ' + err.message);
        });

        telnetClient.on('close', () => {
            socket.emit('status', 'Conexão Telnet encerrada.');
        });
    });

    // Enviar comando do navegador para o Telnet
    socket.on('input', (data) => {
        if (telnetClient) telnetClient.write(data + '\n');
    });

    socket.on('disconnect', () => {
        telnetClient.destroy();
    });
});

app.get('/', (req, res) => res.send('Servidor Proxy Telnet Ativo!'));

server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
