<?php
/**
 * Drilling do Brasil - Pré-emissão de NF / CTe
 * Endpoint: /api/salvar.php
 * Recebe multipart/form-data: campo "payload" (JSON) + arquivos "cnh" e "carregamento".
 * Salva anexos, grava no MySQL (se configurado), gera log JSON e envia e-mail ao fiscal.
 *
 * Hospedagem: HostGator (PHP nativo, sem Composer/Node).
 */

// ----------------------------------------------------------------------------
// CONFIGURAÇÃO (ajuste no cPanel)
// ----------------------------------------------------------------------------
$CONFIG = [
    'email_fiscal'   => 'fiscal@drillingdobrasil.com.br',
    'email_from'     => 'noreply@drillingdobrasil.com.br',
    'enviar_email'   => true,

    // Deixe 'db_ativo' => false para operar somente com log JSON + e-mail.
    'db_ativo'       => false,
    'db_host'        => 'localhost',
    'db_name'        => 'usuario_drilling',
    'db_user'        => 'usuario_drilling',
    'db_pass'        => 'SENHA_AQUI',

    'dir_uploads'    => __DIR__ . '/uploads',
    'dir_logs'       => __DIR__ . '/logs',
    'max_file_bytes' => 8 * 1024 * 1024, // 8MB por arquivo
    'extensoes_ok'   => ['jpg', 'jpeg', 'png', 'webp', 'heic', 'pdf'],
];

// ----------------------------------------------------------------------------
// CABEÇALHOS / CORS
// ----------------------------------------------------------------------------
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function responder($status, $data)
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    responder(405, ['ok' => false, 'erro' => 'Método não permitido.']);
}

// ----------------------------------------------------------------------------
// PAYLOAD
// ----------------------------------------------------------------------------
$raw = isset($_POST['payload']) ? $_POST['payload'] : null;
if (!$raw) {
    $raw = file_get_contents('php://input'); // fallback JSON puro
}

$dados = json_decode($raw, true);
if (!is_array($dados)) {
    responder(400, ['ok' => false, 'erro' => 'Payload inválido ou ausente.']);
}

function campo($arr, $chave, $padrao = '')
{
    return isset($arr[$chave]) && $arr[$chave] !== null ? trim((string) $arr[$chave]) : $padrao;
}

// Validação mínima
$obrigatorios = ['tipoOperacao', 'origem', 'destinoObra', 'motoristaNome', 'placaCavalo'];
$faltando = [];
foreach ($obrigatorios as $c) {
    if (campo($dados, $c) === '') {
        $faltando[] = $c;
    }
}
if ($faltando) {
    responder(422, ['ok' => false, 'erro' => 'Campos obrigatórios ausentes: ' . implode(', ', $faltando)]);
}

// ----------------------------------------------------------------------------
// PROTOCOLO
// ----------------------------------------------------------------------------
date_default_timezone_set('America/Sao_Paulo');
$protocolo = 'DRL-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 5));
$agora = date('Y-m-d H:i:s');

// ----------------------------------------------------------------------------
// UPLOADS
// ----------------------------------------------------------------------------
foreach ([$CONFIG['dir_uploads'], $CONFIG['dir_logs']] as $dir) {
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        responder(500, ['ok' => false, 'erro' => 'Não foi possível criar a pasta ' . basename($dir) . '.']);
    }
}

$pastaEnvio = $CONFIG['dir_uploads'] . '/' . date('Y-m') . '/' . $protocolo;
$anexos = [];

function salvarArquivo($chave, $pastaEnvio, $CONFIG, $protocolo)
{
    if (!isset($_FILES[$chave]) || $_FILES[$chave]['error'] === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    $f = $_FILES[$chave];
    if ($f['error'] !== UPLOAD_ERR_OK) {
        return null;
    }
    if ($f['size'] > $CONFIG['max_file_bytes']) {
        responder(413, ['ok' => false, 'erro' => 'Arquivo ' . $chave . ' excede o tamanho máximo permitido.']);
    }
    $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
    if (!in_array($ext, $CONFIG['extensoes_ok'], true)) {
        responder(415, ['ok' => false, 'erro' => 'Formato não permitido em ' . $chave . '.']);
    }
    if (!is_dir($pastaEnvio) && !@mkdir($pastaEnvio, 0755, true)) {
        responder(500, ['ok' => false, 'erro' => 'Falha ao criar pasta de anexos.']);
    }
    $nome = $chave . '-' . $protocolo . '.' . $ext;
    $destino = $pastaEnvio . '/' . $nome;
    if (!move_uploaded_file($f['tmp_name'], $destino)) {
        responder(500, ['ok' => false, 'erro' => 'Falha ao salvar o anexo ' . $chave . '.']);
    }
    return 'uploads/' . date('Y-m') . '/' . $protocolo . '/' . $nome;
}

foreach (['cnh', 'carregamento'] as $chave) {
    $caminho = salvarArquivo($chave, $pastaEnvio, $CONFIG, $protocolo);
    if ($caminho) {
        $anexos[$chave] = $caminho;
    }
}

// ----------------------------------------------------------------------------
// ITENS DA CARGA
// ----------------------------------------------------------------------------
$itens = isset($dados['itens']) && is_array($dados['itens']) ? $dados['itens'] : [];
$valorTotal = 0.0;
foreach ($itens as $i) {
    $q = isset($i['quantidade']) ? (float) $i['quantidade'] : 0;
    $v = isset($i['valor']) ? (float) str_replace(',', '.', (string) $i['valor']) : 0;
    $valorTotal += $q * $v;
}

$registro = [
    'protocolo'    => $protocolo,
    'recebido_em'  => $agora,
    'ip'           => isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '',
    'valor_total'  => round($valorTotal, 2),
    'anexos'       => $anexos,
    'dados'        => $dados,
];

// ----------------------------------------------------------------------------
// LOG JSON (sempre)
// ----------------------------------------------------------------------------
@file_put_contents(
    $CONFIG['dir_logs'] . '/' . date('Y-m') . '.jsonl',
    json_encode($registro, JSON_UNESCAPED_UNICODE) . PHP_EOL,
    FILE_APPEND | LOCK_EX
);

// ----------------------------------------------------------------------------
// MYSQL (opcional)
// ----------------------------------------------------------------------------
/*
CREATE TABLE pre_emissoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  protocolo VARCHAR(32) NOT NULL UNIQUE,
  recebido_em DATETIME NOT NULL,
  transporte VARCHAR(40),
  transportadora_razao VARCHAR(180),
  transportadora_cnpj VARCHAR(24),
  transportadora_antt VARCHAR(24),
  tipo_operacao VARCHAR(120),
  origem VARCHAR(180),
  destino_obra VARCHAR(180),
  destino_endereco VARCHAR(255),
  motorista_nome VARCHAR(140),
  motorista_cpf VARCHAR(20),
  placa_cavalo VARCHAR(12),
  placa_carreta VARCHAR(12),
  peso_bruto DECIMAL(12,2),
  volumes INT,
  valor_total DECIMAL(14,2),
  observacoes TEXT,
  itens_json LONGTEXT,
  anexos_json TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
*/
$db_ok = null;
if (!empty($CONFIG['db_ativo'])) {
    try {
        $pdo = new PDO(
            "mysql:host={$CONFIG['db_host']};dbname={$CONFIG['db_name']};charset=utf8mb4",
            $CONFIG['db_user'],
            $CONFIG['db_pass'],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $sql = 'INSERT INTO pre_emissoes
            (protocolo, recebido_em, transporte, transportadora_razao, transportadora_cnpj, transportadora_antt,
             tipo_operacao, origem, destino_obra, destino_endereco, motorista_nome, motorista_cpf,
             placa_cavalo, placa_carreta, peso_bruto, volumes, valor_total, observacoes, itens_json, anexos_json)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            $protocolo,
            $agora,
            campo($dados, 'transporte'),
            campo($dados, 'transportadoraRazao'),
            campo($dados, 'transportadoraCnpj'),
            campo($dados, 'transportadoraAntt'),
            campo($dados, 'tipoOperacao'),
            campo($dados, 'origem'),
            campo($dados, 'destinoObra'),
            campo($dados, 'destinoEndereco'),
            campo($dados, 'motoristaNome'),
            campo($dados, 'motoristaCpf'),
            strtoupper(campo($dados, 'placaCavalo')),
            strtoupper(campo($dados, 'placaCarreta')),
            (float) str_replace(',', '.', campo($dados, 'pesoBruto', '0')),
            (int) campo($dados, 'volumes', '0'),
            round($valorTotal, 2),
            campo($dados, 'observacoes'),
            json_encode($itens, JSON_UNESCAPED_UNICODE),
            json_encode($anexos, JSON_UNESCAPED_UNICODE),
        ]);
        $db_ok = true;
    } catch (Exception $e) {
        $db_ok = false;
        @file_put_contents(
            $CONFIG['dir_logs'] . '/erros.log',
            "[$agora] $protocolo MySQL: " . $e->getMessage() . PHP_EOL,
            FILE_APPEND | LOCK_EX
        );
    }
}

// ----------------------------------------------------------------------------
// E-MAIL PARA O SETOR FISCAL
// ----------------------------------------------------------------------------
if (!empty($CONFIG['enviar_email'])) {
    $linhas = [];
    $linhas[] = "PRE-EMISSAO NF/CTe - DRILLING DO BRASIL";
    $linhas[] = "Protocolo: $protocolo";
    $linhas[] = "Recebido em: $agora";
    $linhas[] = str_repeat('-', 40);
    $linhas[] = "Operacao: " . campo($dados, 'tipoOperacao');
    $linhas[] = "Transporte: " . campo($dados, 'transporte');
    if (campo($dados, 'transportadoraRazao') !== '') {
        $linhas[] = "Transportadora: " . campo($dados, 'transportadoraRazao')
            . " | CNPJ: " . campo($dados, 'transportadoraCnpj')
            . " | ANTT: " . campo($dados, 'transportadoraAntt');
    }
    $linhas[] = "Origem: " . campo($dados, 'origem');
    $linhas[] = "Destino: " . campo($dados, 'destinoObra') . " - " . campo($dados, 'destinoEndereco');
    $linhas[] = "Motorista: " . campo($dados, 'motoristaNome') . " | CPF: " . campo($dados, 'motoristaCpf');
    $linhas[] = "Placas: " . strtoupper(campo($dados, 'placaCavalo')) . " / " . strtoupper(campo($dados, 'placaCarreta'));
    $linhas[] = str_repeat('-', 40);
    foreach ($itens as $n => $i) {
        $linhas[] = ($n + 1) . ') ' . campo($i, 'descricao')
            . ' | Qtd: ' . campo($i, 'quantidade')
            . ' | R$ ' . campo($i, 'valor');
    }
    $linhas[] = str_repeat('-', 40);
    $linhas[] = "Peso bruto: " . campo($dados, 'pesoBruto') . " kg";
    $linhas[] = "Volumes: " . campo($dados, 'volumes');
    $linhas[] = "Valor total estimado: R$ " . number_format($valorTotal, 2, ',', '.');
    $linhas[] = "Obs: " . campo($dados, 'observacoes');
    if ($anexos) {
        $linhas[] = "Anexos: " . implode(', ', array_values($anexos));
    }

    $corpo = implode("\n", $linhas);
    $headers = "From: Drilling Fiscal <{$CONFIG['email_from']}>\r\n";
    $headers .= "Content-Type: text/plain; charset=UTF-8\r\n";
    @mail($CONFIG['email_fiscal'], "[$protocolo] Pre-emissao " . campo($dados, 'tipoOperacao'), $corpo, $headers);
}

// ----------------------------------------------------------------------------
// RESPOSTA
// ----------------------------------------------------------------------------
responder(200, [
    'ok'          => true,
    'protocolo'   => $protocolo,
    'recebido_em' => $agora,
    'anexos'      => $anexos,
    'valor_total' => round($valorTotal, 2),
    'banco'       => $db_ok,
    'mensagem'    => 'Pré-emissão recebida com sucesso.',
]);
