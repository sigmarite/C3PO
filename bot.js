var Discord = require('discord.io');
var auth = require('./vault/auth.json');
const request = require('request');
const cheerio = require('cheerio');

const baseUrl = 'https://raw.githubusercontent.com/guidokessels/xwing-data2/master/';
var data = {pilots: {}, upgrades: {}};

// Initialize Discord Bot
var bot = new Discord.Client({
   token: auth.token,
   autorun: true
});
bot.on('ready', function (evt) {
    console.log('Connected');
    console.log('Logged in as: ');
    console.log(bot.username + ' - (' + bot.id + ')');
    loadData()
});
bot.on('message', function (user, userID, channelID, message, evt) {
    // Our bot needs to know if it will execute a command
    // It will listen for messages that will start with `!`
    if (message.substring(0, 1) == '!') {
        var args = message.substring(1).split(' ');
        var cmd = args[0];
       
        args = args.splice(1);
        switch(cmd) {
            // !ping
            case 'ping':
                bot.sendMessage({
                    to: channelID,
                    message: ':smile:'
                });
            break;
            case 'reload':
            loadData();
                bot.sendMessage({
                    to: channelID,
                    message: 'data reloaded!'
                });
            break;
         }
     }

    if (message.startsWith('https://raithos.github.io/')) {
        const targetWebsite = message;
        const xwsWebsite = targetWebsite.replace('https://raithos.github.io/', 'https://yasb2-xws.herokuapp.com/');
        
        request(xwsWebsite, function (err, res, body) {
            if (err) { return console.log(err); }

            const $ = cheerio.load(body)
            const listPrinter = new ListPrinter(JSON.parse($.text()));

            bot.sendMessage({
                to: channelID,
                message: 'wow! a link to YASB2!',
                embed: listPrinter.getEmbed(targetWebsite)
            })
        });
    }
});

function loadData() {

    request(baseUrl + 'data/manifest.json', function (err, res, body) {
        if (err) { return console.log(err); }

        const $ = cheerio.load(body)
        data['manifest'] = JSON.parse($.text());

        const shipFileList = data.manifest.pilots.map((factionPilots) => factionPilots.ships).reduce((acc, val) => acc.concat(val), []);
        const upgradeFileList = data.manifest.upgrades;

        loadFactions();
        loadPilots(shipFileList);
        loadUpgrades(upgradeFileList);
    });    
}

function loadFactions() {
    request(baseUrl + data.manifest.factions[0], function (err, res, body) {
        if (err) { return console.log(err); }

        const $ = cheerio.load(body)
        const factionsList = JSON.parse($.text());
        const factionsMap = {};
        for (let faction of factionsList) {
            factionsMap[faction.xws] = faction;
        }
        data['factions'] = factionsMap;
    });      
}

function loadPilots(shipFileList) {
    for (let file of shipFileList) {
        request(baseUrl + file, function (err, res, body) {
            if (err) { return console.log(err); }
    
            const $ = cheerio.load(body)
            const ship = JSON.parse($.text());
            const shipPilots = ship.pilots;
            for (pilot of shipPilots) {
                data.pilots[pilot.xws] = pilot;
            }
        });
    }
}

function loadUpgrades(upgradeFileList) {
    for (let file of upgradeFileList) {
        request(baseUrl + file, function (err, res, body) {
            if (err) { return console.log(err); }
    
            const $ = cheerio.load(body)
            const upgrades = JSON.parse($.text());
            for (upgrade of upgrades) {
                data.upgrades[upgrade.xws] = upgrade;
            }
        });
    }
}

class ListPrinter {

    constructor(listXWS) {
        this.listXWS = listXWS;
    }

    getEmbed(url) {
        const fields = [];
        for (let pilot of this.listXWS.pilots) {
            const name = "__" + data.pilots[pilot.id].name + "__ (" + pilot.points + ")";
            var value = "";
            const upgrades = Object.values(pilot.upgrades).reduce((acc, val) => acc.concat(val), []);
            for (let upgrade of upgrades) {
                const upgradeData = data.upgrades[upgrade]; 
                value += "\t" + upgradeData.name + " (" + getCost(upgradeData.cost) + ")\n";
            }
            fields.push(
                {
                    "name": name,
                    "value": value
                }
            )
        }

        return {
            "title": "**" + this.listXWS.name ? this.listXWS.name : 'Unnamed Squadron' + "** (" + this.listXWS.points + ")",
            "color": 16309276,
            "thumbnail": {
            "url": data.factions[this.listXWS.faction].icon
            },
            "fields": fields
        }
    }
}

function getCost(upgradeCost) {
    return upgradeCost.value ? upgradeCost.value : Object.values(upgradeCost.values)[0];
}