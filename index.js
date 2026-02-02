const net = require('net');
const http = require('http');
const { Server } = require('socket.io');
const app = require('express')();

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const decoder = new TextDecoder("iso-8859-1");
const PORT = process.env.PORT || 8000;

// Constantes do Protocolo Telnet
const IAC = 255; // Interpret as Command
const DO = 253;
const WILL = 251;
const SB = 250;  // Subnegotiation Begin
const SE = 240;  // Subnegotiation End
const TTYPE = 24; // Terminal Type Option
const IS = 0;
const SEND = 1;

io.on('connection', (socket) => {
    let telnetClient = new net.Socket();

    socket.on('connect-telnet', (config) => {
        const port = config.port || 23;
        const host = config.host;

        console.log(`Conectando Telnet ANSI em ${host}:${port}...`);
        telnetClient.connect(port, host, () => {
            socket.emit('status', 'Conexão estabelecida.');
        });

        telnetClient.on('data', (buffer) => {
            let cleanData = [];
            
            // Processador manual de bytes para lidar com a negociação
            for (let i = 0; i < buffer.length; i++) {
                let byte = buffer[i];

                if (byte === IAC) {
                    const command = buffer[i + 1];
                    const option = buffer[i + 2];

                    // Se o servidor perguntar "DO TTYPE" (Você suporta tipo de terminal?)
                    if (command === DO && option === TTYPE) {
                        // Responde: "WILL TTYPE" (Sim, eu suporto!)
                        const response = Buffer.from([IAC, WILL, TTYPE]);
                        telnetClient.write(response);
                        i += 2; // Pula os bytes processados
                    } 
                    // Se for uma sub-negociação pedindo o tipo (SB TTYPE SEND)
                    else if (command === SB && option === TTYPE && buffer[i + 3] === SEND) {
                        // Responde: "Sou um terminal ANSI"
                        // IAC SB TTYPE IS "ANSI" IAC SE
                        const term = "ANSI"; 
                        const head = Buffer.from([IAC, SB, TTYPE, IS]);
                        const body = Buffer.from(term);
                        const tail = Buffer.from([IAC, SE]);
                        
                        telnetClient.write(Buffer.concat([head, body, tail]));
                        
                        // Avança até o fim da subnegociação (busca o SE)
                        while(i < buffer.length && buffer[i] !== SE) { i++; }
                    }
                    // Ignora outros comandos IAC para não sujar a tela
                    else {
                        // Avança simples (IAC + CMD + OPT)
                        if (command >= 251 && command <= 254) i += 2;
                        else if (command === SB) {
                            // Avança até o fim da subnegociação
                            while(i < buffer.length && buffer[i] !== SE) { i++; }
                        }
                        else i += 1; // Comandos simples de 2 bytes
                    }
                } else {
                    // Se não for comando, é texto do jogo!
                    cleanData.push(byte);
                }
            }

            // Envia apenas o texto limpo para o navegador
            if (cleanData.length > 0) {
                const textBuffer = Buffer.from(cleanData);
                const text = decoder.decode(textBuffer);
                socket.emit('output', text);
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

app.get('/', (req, res) => res.send('MUD Proxy v6 (ANSI Negotiation)'));
server.listen(PORT, '0.0.0.0', () => console.log(`Rodando na porta ${PORT}`));
