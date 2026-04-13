const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client();

const numeros = [
  '5519990019866@c.us',
  '5519999948769@c.us'
];

const mensagens = [
  "Bom dia! Identificamos um débito em aberto na ESC Araras. Como você prefere regularizar?",
  "Olá, tudo bem? Consta um débito na ESC Araras. Pode me informar como deseja resolver?",
  "Bom dia, verificamos um valor pendente na ESC Araras. Posso te passar as opções que temos para regularizar?"
];

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('Bot pronto!');

  for (const numero of numeros) {
    try {
      const chat = await client.getChatById(numero);

      await client.sendPresenceAvailable();
      await chat.sendStateTyping();

      await delay(3000 + Math.random() * 5000);

      const msg = mensagens[Math.floor(Math.random() * mensagens.length)];

      await client.sendMessage(numero, msg);

      console.log(`Mensagem enviada para ${numero}`);

      await delay(10000 + Math.random() * 10000);

    } catch (erro) {
      console.log(`Erro ao enviar para ${numero}`, erro);
    }
  }
});

client.initialize();