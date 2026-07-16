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
