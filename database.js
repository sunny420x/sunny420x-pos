var mysql = require('mysql2')
var path = require('path')

require('dotenv').config({ path: path.join(__dirname, '.env') });

var con = mysql.createPool({
    connectionLimit: 10,
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE
})

con.getConnection((err, connection) => {
    if (err) {
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
          console.error('[!] Database connection was closed.')
        }
        if (err.code === 'ER_CON_COUNT_ERROR') {
          console.error('[!] Database has too many connections.')
        }
        if (err.code === 'ECONNREFUSED') {
          console.error('[!] Database connection was refused.')
        }
      }
    if (connection) connection.release()

    return
})

//con.query = util.promisify(con.query)

module.exports = con