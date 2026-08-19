const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error("DATABASE_URL não configurada");
}

const pool = new Pool({
	connectionString
});

pool.on("error", error => {
	console.error("Erro inesperado no pool PostgreSQL:", error.message);
});

async function testarConexao() {
	const client = await pool.connect();

	try {
		await client.query("SELECT 1");
	} finally {
		client.release();
	}
}

module.exports = {
	pool,
	testarConexao
};
