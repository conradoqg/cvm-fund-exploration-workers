const stream = require('stream');
const QueryStream = require('pg-query-stream');
const promisePipe = require('promisepipe');

const createAccumulatorStream = require('./createAccumulatorStream');
const createInsertPromiseStream = require('./createInsertPromiseStream');
const createCalculatorStream = require('./createCalculatorStream');
const createDummyWritableObjectStream = require('./createDummyWritableObjectStream');
const CONFIG = require('../config');

const createFundCalculatorStream = (db) => {
    return stream.Transform({
        objectMode: true,
        highWaterMark: CONFIG.highWaterMark,
        transform: async (chunk, e, callback) => {
            try {
                const client = await db.pool.connect();
                try {
                    await client.query('BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED');
                    const query = new QueryStream(`SELECT * FROM inf_diario_fi LEFT JOIN fbcdata_sgs_12i ON inf_diario_fi.DT_COMPTC = fbcdata_sgs_12i.DATA WHERE CNPJ_FUNDO = '${chunk.cnpj_fundo}' ORDER BY DT_COMPTC ASC`);
                    const dataStream = client.query(query);

                    await promisePipe(
                        dataStream,
                        createCalculatorStream(),
                        createAccumulatorStream(),
                        createInsertPromiseStream(db),
                        createDummyWritableObjectStream()
                    );

                    await client.query('COMMIT');
                    callback(null, chunk);
                } catch (ex) {
                    await client.query('ROLLBACK');
                    throw ex;
                } finally {
                    client.release();
                }
            } catch (ex) {
                console.error(ex);
                callback(ex);
            }
        }
    });
};

module.exports = createFundCalculatorStream;