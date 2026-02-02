const net = require('net');
const http = require('http');
const { Server } = require('socket.io');
const app = require('express')();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Decoder para ISO-8859-1 (MUDs clássicos)
const decoder = new TextDecoder("iso-8859-1");

const PORT = process.env.PORT || 8000;

io.on('connection', (socket) => {
    let telnetClient = new net.Socket();

    socket.on('connect-telnet', (config) => {
        telnetClient.connect(config.port || 23, config.host, () => {
            socket.emit('status', 'Conectado');
        });

        telnetClient.on('data', (data) => {
            socket.emit('output', decoder.decode(data));
        });

        telnetClient.on('error', (err) => socket.emit('status', 'Erro: ' + err.message));
        telnetClient.on('close', () => socket.emit('status', 'Desconectado'));
    });

    socket.on('input', (data) => {
        if (telnetClient && telnetClient.writable) {
            telnetClient.write(data + '\n');
        }
    });

    socket.on('heartbeat', () => socket.emit('heartbeat-ack'));

    socket.on('disconnect', () => telnetClient.destroy());
});

app.get('/', (req, res) => res.send('MUD Engine v2 Active'));
server.listen(PORT, '0.0.0.0', () => console.log(`Proxy rodando na porta ${PORT}`));
