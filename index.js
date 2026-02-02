const net = require('net');
const http = require('http');
const { Server } = require('socket.io');
const app = require('express')();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Decodificador para ISO-8859-1 (Latin1) - Padrão da maioria dos MUDs BR
const decoder = new TextDecoder("iso-8859-1");

const PORT = process.env.PORT || 8000;

io.on('connection', (socket) => {
    let telnetClient = new net.Socket();

    socket.on('connect-telnet', (config) => {
        const port = config.port || 23;
        const host = config.host;

        console.log(`Tentando conectar em ${host}:${port}...`);

        telnetClient.connect(port, host, () => {
            socket.emit('status', 'Conectado! Aguardando dados...');
            
            // TRUQUE: Envia um "Enter" invisível assim que conecta.
            // Muitos MUDs precisam disso para mostrar a tela de login.
            telnetClient.write('\r\n');
        });

        telnetClient.on('data', (buffer) => {
            // FILTRO TELNET: Remove sequências de negociação (começam com 0xFF / 255)
            // Se não limpar isso, o navegador pode travar ou não mostrar nada.
            const cleanBuffer = Buffer.from(buffer.filter(byte => byte !== 255));
            
            // Só envia se tiver texto real
            if (cleanBuffer.length > 0) {
                const text = decoder.decode(cleanBuffer);
                socket.emit('output', text);
            }
        });

        telnetClient.on('error', (err) => {
            console.error("Erro Socket:", err.message);
            socket.emit('status', 'Erro: ' + err.message);
        });

        telnetClient.on('close', () => {
            socket.emit('status', 'Desconectado do servidor.');
        });
    });

    socket.on('input', (data) => {
        if (telnetClient && !telnetClient.destroyed) {
            telnetClient.write(data + '\r\n');
        }
    });

    socket.on('heartbeat', () => socket.emit('heartbeat-ack'));

    socket.on('disconnect', () => {
        if(telnetClient) telnetClient.destroy();
    });
});

app.get('/', (req, res) => res.send('MUD Proxy v4 (Telnet Fix) Online'));
server.listen(PORT, '0.0.0.0', () => console.log(`Servidor rodando na porta ${PORT}`));
