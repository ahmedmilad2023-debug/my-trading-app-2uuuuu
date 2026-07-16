/*
====================================================
 Crypto SMC Signals
 app.js

 Strategy:
 Order Block + First Retest + ADX
 Timeframe: 15 Minutes
====================================================
*/


// ===============================
// Application Settings
// ===============================

const CONFIG = {

    timeframe: "15m",

    symbols: [
        "BTCUSDT",
        "ETHUSDT",
        "BNBUSDT",
        "SOLUSDT",
        "XRPUSDT",
        "DOGEUSDT",
        "ADAUSDT",
        "AVAXUSDT",
        "LINKUSDT",
        "SUIUSDT"
    ],

    candleLimit: 200,

    adxPeriod: 14,

    adxMinimum: 25,

    riskRewardTP1: 2,

    riskRewardTP2: 3,

    scanTime: 15000

};



let currentSymbol = "BTCUSDT";

let signalsHistory = [];

let lastSignalID = null;



// ===============================
// Binance Data Engine
// ===============================


class BinanceEngine {


    constructor(){

        this.url =
        "https://api.binance.com/api/v3/klines";

    }



    async getCandles(symbol){


        try{


            let response =
            await fetch(

            `${this.url}?symbol=${symbol}&interval=${CONFIG.timeframe}&limit=${CONFIG.candleLimit}`

            );


            let data =
            await response.json();



            return data.map(item=>({


                time:item[0],

                open:Number(item[1]),

                high:Number(item[2]),

                low:Number(item[3]),

                close:Number(item[4]),

                volume:Number(item[5])


            }));


        }

        catch(error){


            console.log(
            "Binance Error:",
            error
            );


            return [];


        }


    }


}



const binance =
new BinanceEngine();



// ===============================
// ADX Indicator
// ===============================


class ADXIndicator {



    calculate(candles){


        let period =
        CONFIG.adxPeriod;


        if(candles.length < period + 2)
        return 0;



        let tr=[];

        let plus=[];

        let minus=[];



        for(
            let i=1;
            i<candles.length;
            i++
        ){


            let current =
            candles[i];


            let previous =
            candles[i-1];



            tr.push(

                Math.max(

                current.high-current.low,

                Math.abs(
                current.high-previous.close
                ),

                Math.abs(
                current.low-previous.close
                )

                )

            );



            let up =
            current.high -
            previous.high;


            let down =
            previous.low -
            current.low;



            plus.push(

                up > down && up > 0
                ?
                up
                :
                0

            );


            minus.push(

                down > up && down > 0
                ?
                down
                :
                0

            );


        }



        let atr =
        this.average(tr,period);


        let plusAvg =
        this.average(plus,period);


        let minusAvg =
        this.average(minus,period);



        if(
            !atr ||
            !plusAvg ||
            !minusAvg
        )
        return 0;



        let plusDI =
        (plusAvg / atr) * 100;


        let minusDI =
        (minusAvg / atr) * 100;



        let dx =

        Math.abs(
            plusDI-minusDI
        )
        /
        (
            plusDI+minusDI
        )
        *
        100;



        return Number(
            dx.toFixed(2)
        );


    }



    average(data,period){


        if(data.length < period)
        return null;



        let values =
        data.slice(
        data.length-period
        );


        return values.reduce(
            (a,b)=>a+b,
            0
        ) / period;


    }


}



const adx =
new ADXIndicator();
// ===============================
// Order Block Detector
// ===============================


class OrderBlockDetector {


    detect(candles){


        let blocks = [];



        for(
            let i = 2;
            i < candles.length - 2;
            i++
        ){


            let current =
            candles[i];


            let next =
            candles[i+1];



            // Bullish Order Block

            if(

                current.close < current.open &&

                next.close > next.open &&

                next.close > current.high

            ){


                blocks.push({

                    type:"BUY",

                    high:current.high,

                    low:current.low,

                    index:i,

                    used:false


                });


            }



            // Bearish Order Block

            if(

                current.close > current.open &&

                next.close < next.open &&

                next.close < current.low

            ){


                blocks.push({

                    type:"SELL",

                    high:current.high,

                    low:current.low,

                    index:i,

                    used:false


                });


            }


        }



        return blocks;


    }





    // ===============================
    // First Retest Filter
    // ===============================


    firstRetest(block,candles){


        let touches = 0;



        for(

            let i = block.index + 1;

            i < candles.length;

            i++

        ){


            let candle =
            candles[i];



            if(

                candle.high >= block.low &&

                candle.low <= block.high

            ){


                touches++;


            }


        }



        // نسمح بلمسة واحدة فقط

        if(touches !== 1)

        return false;



        let last =
        candles[candles.length-1];



        if(

            last.high >= block.low &&

            last.low <= block.high

        ){


            return true;


        }



        return false;


    }



}



const orderBlock =
new OrderBlockDetector();




// ===============================
// Risk Management
// ===============================


class RiskManager {



    calculate(signal){



        let entry =
        signal.entry;



        let stop =
        signal.stopLoss;



        let risk =
        Math.abs(
            entry-stop
        );



        if(signal.type==="BUY"){



            signal.target1 =
            entry + risk * CONFIG.riskRewardTP1;



            signal.target2 =
            entry + risk * CONFIG.riskRewardTP2;



        }



        else {



            signal.target1 =
            entry - risk * CONFIG.riskRewardTP1;



            signal.target2 =
            entry - risk * CONFIG.riskRewardTP2;



        }



        return signal;


    }


}



const risk =
new RiskManager();
// ===============================
// Final Signal Engine
// ===============================


class SignalEngine {


    analyze(symbol, candles){


        if(!candles || candles.length < 50){

            return null;

        }



        // 1 - فحص قوة الاتجاه ADX

        let adxValue =
        adx.calculate(candles);



        if(adxValue < CONFIG.adxMinimum){


            return null;


        }





        // 2 - البحث عن Order Block

        let blocks =
        orderBlock.detect(candles);



        if(blocks.length === 0){


            return null;


        }



        let block =
        blocks[blocks.length - 1];





        // 3 - فحص إعادة الاختبار الأولى

        let validRetest =

        orderBlock.firstRetest(
            block,
            candles
        );



        if(!validRetest){


            return null;


        }





        let price =

        candles[candles.length-1].close;





        let signal = {


            id:
            Date.now(),


            symbol:
            symbol,


            type:
            block.type,


            entry:
            price,


            stopLoss:
            null,


            target1:
            null,


            target2:
            null,


            adx:
            adxValue,


            reason:""



        };





        // ==========================
        // BUY Signal
        // ==========================


        if(block.type === "BUY"){



            signal.stopLoss =
            block.low;



            signal.reason =

            `
            إشارة شراء:
            
            - تم اكتشاف Order Block صاعد.
            - السعر عاد للمنطقة لأول مرة.
            - ADX يؤكد وجود قوة اتجاه.
            - الدخول مع منطقة الطلب.
            `;



        }





        // ==========================
        // SELL Signal
        // ==========================


        if(block.type === "SELL"){



            signal.stopLoss =
            block.high;



            signal.reason =

            `
            إشارة بيع:
            
            - تم اكتشاف Order Block هابط.
            - السعر عاد للمنطقة لأول مرة.
            - ADX يؤكد وجود قوة اتجاه.
            - الدخول مع منطقة العرض.
            `;



        }






        // حساب الأهداف

        signal =
        risk.calculate(signal);




        return signal;


    }


}



const signalEngine =
new SignalEngine();
// ===============================
// Market Scanner
// ===============================


class MarketScanner {


    constructor(){


        this.running = false;


    }



    async scanSymbol(symbol){


        let candles =

        await binance.getCandles(symbol);



        if(candles.length === 0){

            return null;

        }



        let signal =

        signalEngine.analyze(
            symbol,
            candles
        );



        if(signal){


            this.handleSignal(signal);


        }


        return signal;


    }





    async scanAll(){



        for(
            let symbol of CONFIG.symbols
        ){


            await this.scanSymbol(symbol);


        }



        document.getElementById(
            "lastUpdate"
        ).innerText =

        new Date()
        .toLocaleTimeString();


    }





    start(){


        if(this.running)
        return;



        this.running = true;



        this.scanAll();



        setInterval(()=>{


            this.scanAll();


        },
        CONFIG.scanTime
        );


    }





    handleSignal(signal){



        let signalID =

        signal.symbol +
        signal.type +
        signal.entry;



        // منع تكرار نفس الصفقة

        if(
            lastSignalID === signalID
        ){

            return;

        }



        lastSignalID =
        signalID;



        signalsHistory.unshift(
            signal
        );



        saveHistory();



        displaySignal(
            signal
        );



        sendNotification(
            signal
        );


    }



}



const scanner =

new MarketScanner();





// ===============================
// Start Application
// ===============================


window.addEventListener(
"load",
()=>{


    scanner.start();


});
// ===============================
// UI Signal Display
// ===============================


function displaySignal(signal){


    const container =

    document.getElementById(
        "signalContainer"
    );



    if(!container)
    return;



    let typeClass =

    signal.type === "BUY"
    ?
    "buy"
    :
    "sell";



    let typeText =

    signal.type === "BUY"
    ?
    "🟢 شراء"
    :
    "🔴 بيع";



    container.innerHTML = `

    <div class="signalCard ${typeClass}">

        <div class="signalHeader">

            <h3>
            ${signal.symbol}
            </h3>

            <strong>
            ${typeText}
            </strong>

        </div>


        <div class="signalRow">
            <span>الدخول</span>
            <strong class="entry">
            ${signal.entry.toFixed(4)}
            </strong>
        </div>


        <div class="signalRow">
            <span>وقف الخسارة</span>
            <strong class="stop">
            ${signal.stopLoss.toFixed(4)}
            </strong>
        </div>


        <div class="signalRow">
            <span>الهدف 1</span>
            <strong class="target">
            ${signal.target1.toFixed(4)}
            </strong>
        </div>


        <div class="signalRow">
            <span>الهدف 2</span>
            <strong class="target">
            ${signal.target2.toFixed(4)}
            </strong>
        </div>


        <div class="signalRow">
            <span>ADX</span>
            <strong>
            ${signal.adx}
            </strong>
        </div>


        <div class="analysisBox">

            <h4>
            سبب الدخول
            </h4>

            <p>
            ${signal.reason}
            </p>

        </div>


        <div class="signalActions">

            <button
            onclick="shareSignal('${signal.symbol}')">

            📤 مشاركة

            </button>


            <button
            onclick="enableAlerts()">

            🔔 تنبيه

            </button>


        </div>


    </div>

    `;


}





// ===============================
// Notification System
// ===============================


async function enableAlerts(){


    if(
    "Notification" in window
    ){


        await Notification.requestPermission();


    }


}





function sendNotification(signal){



    if(
    Notification.permission !== "granted"
    )
    return;



    let title =

    signal.type === "BUY"

    ?
    "🟢 صفقة شراء جديدة"

    :
    "🔴 صفقة بيع جديدة";



    let body =

`
${signal.symbol}

Entry:
${signal.entry}

SL:
${signal.stopLoss}

TP:
${signal.target1}
`;



    new Notification(

        title,

        {

            body:body,

            icon:
            "icons/icon-192.png"

        }

    );


}





// ===============================
// Share Function
// ===============================


function shareSignal(symbol){



    let text =

    `Crypto SMC Signal

${symbol}

تابع الإشارة من التطبيق`;



    if(
    navigator.share
    ){


        navigator.share({

            title:
            "Crypto Signal",

            text:text


        });


    }

    else{


        navigator.clipboard.writeText(
            text
        );


        alert(
        "تم نسخ الإشارة"
        );


    }


}





// ===============================
// Local Storage
// ===============================


function saveHistory(){


    localStorage.setItem(

        "signals",

        JSON.stringify(
            signalsHistory
        )

    );


}





function loadHistory(){



    let data =

    localStorage.getItem(
        "signals"
    );



    if(data){


        signalsHistory =
        JSON.parse(data);


    }


}





// تحميل السجل عند التشغيل

loadHistory();
