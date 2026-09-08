import dotenv from "dotenv";
dotenv.config();
import { interpretarPedido } from "./services/claude.js";

const resultado = await interpretarPedido("oi, queria um pijama de inverno pra minha filha, uns 8 anos");
console.log(resultado);