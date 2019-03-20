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
                pilot.ship = ship;
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
        var totalCost = 0;
        for (let pilot of this.listXWS.pilots) {
            var pilotCost = 0;
            const pilotData = data.pilots[pilot.id] ? data.pilots[pilot.id] : {name: pilot.id, cost: NaN, ship: {name: 'undefined'}};
            pilotCost += pilotData.cost;
            const name1 = "__" + pilotData.name + "__";
            totalCost += pilotData.cost;
            var value1 = "\t*" + pilotData.ship.name + "*\n";
            var value2 = "(" + (pilotData.cost ? pilotData.cost : NaN) + ")\n";
            const upgrades = Object.values(pilot.upgrades ? pilot.upgrades : []).reduce((acc, val) => acc.concat(val), []);
            for (let upgrade of upgrades) {
                const upgradeData = data.upgrades[upgrade] ? data.upgrades[upgrade] : {cost: {value: NaN, name: upgrade}}; 
                const upgradeCost = getCost(upgradeData.cost, pilotData);
                value1 += upgradeData.name + "\n";
                value2 +=  "(" + upgradeCost + ")\n";
                totalCost += upgradeCost;
                pilotCost += upgradeCost
            }
            const name2 =  "(" + pilotCost + ")";
            fields.push(
                {
                    "name": name1,
                    "value": value1,
                    "inline": true
                }
            );
            fields.push(
                {
                    "name": name2,
                    "value": value2,
                    "inline": true
                }
            )
        }

        return {
            "title": "**" + (this.listXWS.name ? this.listXWS.name : 'Unnamed Squadron') + "** (" + totalCost + ")",
            "color": 16309276,
            "url": url,
            "thumbnail": {
            "url": data.factions[this.listXWS.faction] ? data.factions[this.listXWS.faction].icon : 'https://i.kym-cdn.com/photos/images/newsfeed/001/005/938/600.jpg'
            },
            "fields": fields
        }
    }
}

function getCost(upgradeCost, dataPilot) {
    if (upgradeCost == undefined) {
        return 0;
    }
    if (upgradeCost.value != undefined) {
        return upgradeCost.value ;
    } else if (upgradeCost.values != undefined) {
        switch (upgradeCost.variable) {
            case "size":
            const size = dataPilot.ship.size;
                return upgradeCost.values[size];
            case "agility":
                const agility = dataPilot.ship.stats.filter((stat) => stat.type == "agility")[0].value;
                return upgradeCost.values[agility];
            case "initiative":
                const init = dataPilot.initiative
                return upgradeCost.values[init];
            default:
                return Object.values(upgradeCost.values)[0];
        }
    }
}
