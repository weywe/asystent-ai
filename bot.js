const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot działa!'));
app.listen(PORT, () => console.log(`Serwer HTTP uruchomiony na porcie ${PORT}`));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', async () => {
    console.log(` Asystent Resellingu Online! Zalogowano jako ${client.user.tag}`);
    const guildId = process.env.GUILD_ID;
    if (guildId) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
            await guild.commands.create({
                name: 'resell',
                description: 'Uruchom Panel Asystenta Resellingu'
            });
        }
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'resell') {
        const embed = new EmbedBuilder()
            .setColor('#2b2d31')
            .setTitle(' Panel Asystenta Resellingu AI')
            .setDescription('Wybierz akcję poniżej, aby wygenerować opis przedmiotu na podstawie zdjęcia, uzyskać porady lub poznać zasady sprzedaży na danej platformie.');

        const rowButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('btn_gen_opis')
                .setLabel(' Generuj opis')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('btn_gen_foto')
                .setLabel(' Wytyczne do zdjęcia')
                .setStyle(ButtonStyle.Secondary)
        );

        const rowSelect = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('select_platforma')
                .setPlaceholder(' Zapytaj o platformę (Vinted, OLX...)')
                .addOptions([
                    { label: 'Vinted', value: 'vinted', description: 'Porady, prowizje i algorytm Vinted' },
                    { label: 'OLX', value: 'olx', description: 'Wskazówki i bezpieczna sprzedaż na OLX' },
                    { label: 'eBay / Grailed', value: 'ebay_grailed', description: 'Sprzedaż zagraniczna i weryfikacja' }
                ])
        );

        await interaction.reply({ embeds: [embed], components: [rowButtons, rowSelect] });
    }

    if (interaction.isButton()) {
        if (interaction.customId === 'btn_gen_opis') {
            await interaction.reply({ 
                content: ' Wyślij na ten kanał zdjęcie przedmiotu wraz z krótką adnotacją (np. rozmiar/stan) w opisie wiadomości!', 
                ephemeral: true 
            });
        } else if (interaction.customId === 'btn_gen_foto') {
            await interaction.reply({
                content: ' **Wskazówki dotyczące dobrych zdjęć na reselling:**\n' +
                         '1. Używaj światła dziennego (unikaj żółtego światła domowego).\n' +
                         '2. Zrób wyraziste zdjęcie metki ze składem i rozmiarem.\n' +
                         '3. Sfotografuj zblizenia na potencjalne wady/zmechacenia – buduje to zaufanie.\n' +
                         '4. Użyj jednolitego, czystego tła (tło wieszaka na jasnej ścianie zwiększa wyświetlenia o ~30%).',
                ephemeral: true
            });
        }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'select_platforma') {
        const choice = interaction.values[0];
        let infoText = "";

        if (choice === 'vinted') {
            infoText = " **Vinted Hub:**\n- Brak prowizji dla sprzedającego.\n- Najlepiej schodzą marki streetwear, vintage i popularne (Nike, Carhartt, Zara).\n- **Tip:** Wrzucaj przedmioty w godzinach 18:00–21:00 (szczyt ruchu).";
        } else if (choice === 'olx') {
            infoText = " **OLX Hub:**\n- Świetny do odbioru osobistego oraz cięższych/droższych przedmiotów (elektronika, buty, sprzęt).\n- Pamiętaj o włączeniu Przesyłki OLX dla szybszej transakcji.";
        } else if (choice === 'ebay_grailed') {
            infoText = " **eBay / Grailed Hub:**\n- Wyższe marże na rzadkich ubraniach/butach (high-end, graile).\n- Uwzględnij opłaty i prowizje platformy (~12-15%) przy wycenie przedmiotu.";
        }

        await interaction.reply({ content: infoText, ephemeral: true });
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            const statusMsg = await message.reply(' Analizuję zdjęcie i generuję opis...');

            try {
                const response = await axios.get(attachment.url, { responseType: 'arraybuffer' });
                const imageParts = [
                    {
                        inlineData: {
                            data: Buffer.from(response.data).toString("base64"),
                            mimeType: attachment.contentType
                        },
                    },
                ];

                const prompt = `Jesteś ekspertem od resellingu na platformach Vinted, OLX i eBay. 
                Przeanalizuj to zdjęcie przedmiotu. Uwzględnij też dodatkowe uwagi sprzedawcy: "${message.content}".
                Stwórz atrakcyjny i gotowy opis do wklejenia na aukcję wg wzoru:
                
                 **Tytuł aukcji** (zawierający markę, model, rozmiar, stan)
                 **Marka & Model**
                 **Rozmiar & Stan**
                📝 **Opis szczegółowy** (przeznaczenie, styl, atuty)
                💰 **Sugerowana wycena** (szacunkowa cena w PLN)
                 **Hashtagi / Słowa kluczowe**`;

                const result = await model.generateContent([prompt, ...imageParts]);
                const responseText = result.response.text();

                await statusMsg.edit(responseText);
            } catch (err) {
                console.error(err);
                await statusMsg.edit(' Wystąpił błąd podczas analizy zdjęcia. Upewnij się, że klucz Gemini API jest poprawny.');
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);