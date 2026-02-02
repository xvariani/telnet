const net = require('net');
const http = require('http');
const { Server } = require('socket.io');
const app = require('express')();

const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" } 
});

// Tradutor de caracteres para MUDs (Latin-1)
const decoder = new TextDecoder("iso-8859-1");

const PORT = process.env.PORT || 8000;

io.on('connection', (socket) => {
    console.log('Nova conexão web estabelecida');
    let telnetClient = new net.Socket();

    socket.on('connect-telnet', (config) => {
        const targetHost = config.host;
        const targetPort = config.port || 23;

        telnetClient.connect(targetPort, targetHost, () => {
            socket.emit('status', 'Conectado ao MUD!');
        });

        telnetClient.on('data', (data) => {
            // Tradução de bytes para texto com acentos corretos
            const cleanText = decoder.decode(data);
            socket.emit('output', cleanText);
        });

        telnetClient.on('error', (err) => {
            socket.emit('status', 'Erro: ' + err.message);
        });

        telnetClient.on('close', () => {
            socket.emit('status', 'Conexão encerrada');
        });
    });

    socket.on('input', (data) => {
        if (telnetClient && telnetClient.writable) {
            // Garante que o comando termine com quebra de linha
            telnetClient.write(data + '\n');
        }
    });

    socket.on('disconnect', () => {
        telnetClient.destroy();
    });
});

app.get('/', (req, res) => res.send('Proxy MUD Online - UTF-8 Fixed'));

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
