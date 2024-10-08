const fs = require('fs');
const axios = require('axios');
const path = require('path');
const colors = require('colors');
const { HttpsProxyAgent } = require('https-proxy-agent');
const {DateTime} = require("luxon");

class GLaDOS {
    constructor() {
        this.authUrl = 'https://major.glados.app/api/auth/tg/';
        this.userInfoUrl = 'https://major.glados.app/api/users/';
        this.streakUrl = 'https://major.glados.app/api/user-visits/streak/';
        this.visitUrl = 'https://major.glados.app/api/user-visits/visit/';
        this.rouletteUrl = 'https://major.glados.app/api/roulette';
        this.holdCoinsUrl = 'https://major.glados.app/api/bonuses/coins/';
        this.tasksUrl = 'https://major.glados.app/api/tasks/';
        this.swipeCoinUrl = 'https://major.glados.app/api/swipe_coin/';
        this.proxies = null;
    }

    headers(token = null) {
        const headers = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
            'Content-Type': 'application/json',
            'Origin': 'https://major.glados.app',
            'Referer': 'https://major.glados.app/?tgWebAppStartParam=376905749',
            'Sec-Ch-Ua': '"Not/A)Brand";v="99", "Google Chrome";v="115", "Chromium";v="115"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        return headers;
    }

    log(msg) {
        console.log(`[*] ${msg}`);
    }

    async waitWithCountdown(seconds) {
        for (let i = seconds; i >= 0; i--) {
            process.stdout.write(`\r[*] Chờ ${i} giây để tiếp tục...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('');
    }

    async checkProxyIP(proxy) {
        try {
            const proxyAgent = new HttpsProxyAgent(proxy);
            const response = await axios.get('https://api.ipify.org?format=json', { httpsAgent: proxyAgent });
            if (response.status === 200) {
                return response.data.ip;
            } else {
                throw new Error(`Không thể kiểm tra IP của proxy. Status code: ${response.status}`);
            }
        } catch (error) {
            throw new Error(`Error khi kiểm tra IP của proxy: ${error.message}`);
        }
    }

    async makeRequest(method, url, data = null, token = null, proxyIndex) {
        const headers = this.headers(token);
        const proxy = this.formatProxy(this.proxies[proxyIndex]);
        const httpsAgent = new HttpsProxyAgent(proxy);
        const config = {
            method,
            url,
            headers,
            httpsAgent: httpsAgent,
        };

        if (data) {
            config.data = data;
        }

        try {
            const response = await axios(config);
            return response.data;
        } catch (error) {
            if (error.response && error.response.data) {
                return error.response.data;
            }
            throw error;
        }
    }

    async authenticate(init_data, proxyIndex) {
        return this.makeRequest('POST', this.authUrl, { init_data }, null, proxyIndex);
    }

    async getUserInfo(userId, token, proxyIndex) {
        return this.makeRequest('GET', `${this.userInfoUrl}${userId}/`, null, token, proxyIndex);
    }

    async getStreak(token, proxyIndex) {
        return this.makeRequest('GET', this.streakUrl, null, token, proxyIndex);
    }

    async postVisit(token, proxyIndex) {
        return this.makeRequest('POST', this.visitUrl, {}, token, proxyIndex);
    }

    async spinRoulette(token, proxyIndex) {
        try {
            const result = await this.makeRequest('POST', this.rouletteUrl, {}, token, proxyIndex);
            if (result && result.rating_award > 0) {
                this.log(`Spin thành công, nhận được ${result.rating_award} sao`.green);
            } else {
                this.log(`Spin không thành công, cần mời thêm bạn hoặc chờ ngày hôm sau`.yellow);
            }
            return result;
        } catch (error) {
            this.log(`Không thể spin hôm nay`.yellow);
            return null;
        }
    }

    async holdCoins(token, proxyIndex) {
        const coins = Math.floor(Math.random() * (950 - 900 + 1)) + 900;
        const result = await this.makeRequest('POST', this.holdCoinsUrl, { coins }, token, proxyIndex);
        if (result && result.success) {
            this.log(`HOLD coin thành công, nhận ${coins} sao`.green);
        } else if (result) {
            this.log(`HOLD coin không thành công`.red);
        } else {
            this.log(`Hôm nay bạn đã nhận HOLD coin rồi`.red);
        }
        return result;
    }

    async swipeCoin(token, proxyIndex) {
        const getResponse = await this.makeRequest('GET', this.swipeCoinUrl, null, token, proxyIndex);
        if (getResponse.success) {
            const coins = Math.floor(Math.random() * (1300 - 1000 + 1)) + 1000;
            const payload = { coins };
            const result = await this.makeRequest('POST', this.swipeCoinUrl, payload, token, proxyIndex);
            if (result.success) {
                this.log(`Swipe coin thành công, nhận ${coins} sao`.green);
            } else {
                this.log(`Swipe coin không thành công`.red);
            }
            return result;
        } else if (getResponse.detail && getResponse.detail.blocked_until) {
            const blockedTime = DateTime.fromSeconds(getResponse.detail.blocked_until).setZone('system').toLocaleString(DateTime.DATETIME_MED);
            this.log(`Swipe coin không thành công, cần mời thêm ${getResponse.detail.need_invites} bạn hoặc chờ đến ${blockedTime}`.yellow);
        } else {
            this.log(`Không thể lấy thông tin swipe coin`.red);
        }
        return getResponse;
    }

    async getDailyTasks(token, proxyIndex, daily = false) {
        const tasks = await this.makeRequest('GET', `${this.tasksUrl}?is_daily=${daily}`, null, token, proxyIndex);
        if (tasks) {
            this.log(`Danh sách nhiệm vụ:`.magenta);
            tasks.forEach(task => this.log(`- ${task.id}: ${task.title}`));
        } else {
            this.log(`Error getting daily tasks`.red);
        }
        return tasks;
    }

    async completeTask(token, task, proxyIndex) {
        const result = await this.makeRequest('POST', this.tasksUrl, { task_id: task.id }, token, proxyIndex);
        if (result && result.is_completed) {
            this.log(`Làm nhiệm vụ ${task.id}: ${task.title.yellow} .. trạng thái: thành công`.green);
        } else if (result) {
           this.log(`Làm nhiệm vụ ${task.id}: ${task.title.yellow} .. trạng thái: không thành công`.red);
        } else {
            this.log(`Không thể hoàn thành nhiệm vụ ${task.id}: ${task.title}`.red);
        }
        return result;
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    formatProxy(proxy) {
        // from ip:port:user:pass to http://user:pass@ip:port
        if (proxy.startsWith('http')) {
            return proxy;
        }
        const parts = proxy.split(':');
        if (parts.length === 4) {
          return `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`
        } else {
          return `http://${parts[0]}:${parts[1]}`;
        }
      }

    async main() {
        const dataFile = path.join(__dirname, './../data/major.txt');
        const data = fs.readFileSync(dataFile, 'utf8')
            .split('\n')
            .filter(Boolean);
        const proxyFile = path.join(__dirname, './../data/proxy.txt');
        this.proxies = fs.readFileSync(proxyFile, 'utf8')
            .split('\n')
            .filter(Boolean);

        while (true) {
            for (let i = 0; i < data.length; i++) {
                const init_data = data[i].trim();
                const proxyIndex = i % this.proxies.length;
                const proxy =this.formatProxy(this.proxies[proxyIndex]);

                let proxyIP = 'Unknown';
                try {
                    proxyIP = await this.checkProxyIP(proxy);
                } catch (error) {
                    this.log(`Không thể kiểm tra IP của proxy: ${error.message}`.yellow);
                }

                try {
                    const authResult = await this.authenticate(init_data, proxyIndex);
                    
                    if (authResult) {
                        const { access_token, user } = authResult;
                        const { id, first_name } = user;

                        console.log(`===== Tài khoản ${i + 1}/${data.length} | ${first_name.green} | ip: ${proxyIP} ==========`);

                        const userInfo = await this.getUserInfo(id, access_token, proxyIndex);
                        if (userInfo) {
                            this.log(`Số sao đang có: ${userInfo.rating.toString().white}`.green);
                        }

                        const streakInfo = await this.getStreak(access_token, proxyIndex);
                        if (streakInfo) {
                            this.log(`Đã điểm danh ${streakInfo.streak} ngày!`.green);
                        }

                        const visitResult = await this.postVisit(access_token, proxyIndex);
                        if (visitResult) {
                            if (visitResult.is_increased) {
                                this.log(`Điểm danh thành công ngày ${visitResult.streak}`.green);
                            } else {
                                this.log(`Đã điểm danh trước đó. Streak hiện tại: ${visitResult.streak}`.yellow);
                            }
                        }

                        const rouletteResult = await this.spinRoulette(access_token, proxyIndex);
                        if (rouletteResult) {
                            if (rouletteResult.rating_award > 0) {
                                this.log(`Spin thành công, nhận được ${rouletteResult.rating_award} sao`.green);
                            } else if (rouletteResult.detail && rouletteResult.detail.blocked_until) {
                                const blockedTime = DateTime.fromSeconds(rouletteResult.detail.blocked_until).setZone('system').toLocaleString(DateTime.DATETIME_MED);
                                this.log(`Spin không thành công, cần mời thêm ${rouletteResult.detail.need_invites} bạn hoặc chờ đến ${blockedTime}`.yellow);
                            } else {
                                this.log(`Kết quả spin không xác định`.red);
                            }
                        }

                        await this.holdCoins(access_token, proxyIndex);
                        await this.swipeCoin(access_token, proxyIndex);

                        const tasks = await this.getDailyTasks(access_token, proxyIndex);
                        if (tasks) {
                            for (const task of tasks) {
                                await this.completeTask(access_token, task, proxyIndex);
                                await this.sleep(1000);
                            }
                        }
                        const tasksTrue = await this.getDailyTasks(access_token, proxyIndex, true);
                        if (tasksTrue) {
                            for (const task of tasksTrue) {
                                await this.completeTask(access_token, task, proxyIndex);
                                await this.sleep(1000);
                            }
                        }

                    } else {
                        this.log(`Không đọc được dữ liệu tài khoản ${i + 1}`);
                    }

                    if (i < data.length - 1) {
                        await this.waitWithCountdown(3);
                    }
                } catch (error) {
                    this.log(`Không đọc được dữ liệu tài khoản ${i + 1}: ${error.message}`);
                    continue;
                }
            }
            await this.waitWithCountdown(28850);
        }
    }
}

if (require.main === module) {
    const glados = new GLaDOS();
    glados.main().catch(err => {
        console.error(err);
        process.exit(1);
    });
}