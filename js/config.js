export const STORAGE_KEY = "salonTechAuxiliaryStore_v1";

export const moduleOrder = [
    "clients",
    "appointments",
    "services",
    "team",
    "products",
    "expenses",
    "paymentMethods",
    "finances"
];

export const professionalModuleOrder = [
    "products",
    "services",
    "appointments"
];

export const ROLE_ADMIN = "admin";
export const ROLE_PROFESSIONAL = "professional";
export const AUTH_MARKER_PREFIX = "auth:";
export const DEFAULT_PUBLISHED_ORIGIN = "https://salontech-7ee16.web.app";
export const PUBLISHED_ORIGINS = new Set([
    DEFAULT_PUBLISHED_ORIGIN,
    "https://salontech-7ee16.firebaseapp.com"
]);

export const statusLabels = ["Agendado", "Pago", "Concluído", "Cancelado"];

export const adminModules = {
    clients: {
        label: "Clientes",
        kicker: "Cadastro de clientes",
        submitLabel: "Salvar cliente",
        storeKey: "clients",
        titleField: "nome",
        fields: [
            { name: "nome", label: "Nome", required: true, placeholder: "Nome do cliente" },
            { name: "cpf", label: "CPF", required: true, placeholder: "000.000.000-00", inputmode: "numeric", maxlength: "14" },
            { name: "telefone", label: "Telefone", required: true, placeholder: "(00) 00000-0000", inputmode: "numeric", maxlength: "15" },
            { name: "email", label: "E-mail", type: "email", placeholder: "cliente@email.com" }
        ]
    },
    appointments: {
        label: "Agendamentos",
        kicker: "Servicos prestados",
        submitLabel: "Salvar agendamento",
        storeKey: "appointments",
        titleField: "clienteId",
        fields: [
            { name: "clienteId", label: "Cliente", type: "select", source: "clients", optionLabel: "nome", required: true },
            { name: "servicoId", label: "Servico", type: "select", source: "services", optionLabel: "nome", required: true },
            { name: "data", label: "Data", type: "date", required: true },
            { name: "hora", label: "Hora", type: "time", required: true },
            { name: "formaPagamentoId", label: "Forma de pagamento", type: "select", source: "paymentMethods", optionLabel: "nome" },
            { name: "situacao", label: "Situacao", type: "select", options: statusLabels, required: true },
            { name: "observacoes", label: "Observacoes", type: "textarea", span: 2, placeholder: "Notas do atendimento" }
        ]
    },
    services: {
        label: "Serviços",
        kicker: "Catálogo editável",
        submitLabel: "Salvar serviço",
        storeKey: "services",
        titleField: "nome",
        fields: [
            { name: "nome", label: "Nome", required: true, placeholder: "Ex: Corte Feminino" },
            { name: "categoria", label: "Categoria", type: "select", options: [
                { value: "Cabelo", label: "Cabelo" },
                { value: "Unhas", label: "Unhas" },
                { value: "Estetica", label: "Estética" },
                { value: "Sobrancelha", label: "Sobrancelha" }
            ], required: true },
            { name: "valor", label: "Valor", type: "number", step: "0.01", min: "0", required: true },
            { name: "duracaoMin", label: "Duração em minutos", type: "number", min: "1", required: true },
            { name: "profissionalId", label: "Profissional responsável", type: "select", source: "team", optionLabel: "nome", required: true },
            { name: "comissaoPct", label: "Comissão (%)", type: "number", min: "0", max: "100", step: "1", required: true }
        ]
    },
    team: {
        label: "Equipe",
        kicker: "Profissionais",
        submitLabel: "Salvar profissional",
        storeKey: "team",
        titleField: "nome",
        fields: [
            { name: "nome", label: "Nome", required: true, placeholder: "Nome do profissional" },
            { name: "cpf", label: "CPF", placeholder: "000.000.000-00", inputmode: "numeric", maxlength: "14" },
            { name: "telefone", label: "Telefone", placeholder: "(00) 00000-0000", inputmode: "numeric", maxlength: "15" },
            { name: "cargo", label: "Especialidade", required: true, placeholder: "Cabelo, unhas, estetica" },
            { name: "tipoPagamento", label: "Tipo de pagamento", placeholder: "Salario, comissao ou misto" },
            { name: "salario", label: "Salario", type: "number", step: "0.01", min: "0" }
        ]
    },
    products: {
        label: "Produtos",
        kicker: "Estoque do salao",
        submitLabel: "Salvar produto",
        storeKey: "products",
        titleField: "nome",
        fields: [
            { name: "nome", label: "Produto", required: true, placeholder: "Nome do produto" },
            { name: "quantidade", label: "Quantidade", type: "number", min: "0", required: true },
            { name: "categoria", label: "Categoria", placeholder: "Cabelo, unhas, estetica" }
        ]
    },
    expenses: {
        label: "Despesas",
        kicker: "Gastos do sistema",
        submitLabel: "Salvar despesa",
        storeKey: "expenses",
        titleField: "nome",
        fields: [
            { name: "nome", label: "Descricao", required: true, placeholder: "Ex: reposicao de produtos" },
            { name: "data", label: "Data", type: "date", required: true },
            { name: "valor", label: "Valor", type: "number", step: "0.01", min: "0", required: true }
        ]
    },
    paymentMethods: {
        label: "Pagamentos",
        kicker: "Formas de pagamento",
        submitLabel: "Salvar forma",
        storeKey: "paymentMethods",
        titleField: "nome",
        fields: [
            { name: "nome", label: "Nome", required: true, placeholder: "Pix, dinheiro, cartao..." }
        ]
    },
    finances: {
        label: "Finanças",
        kicker: "Entradas x despesas",
        submitLabel: "Atualizar relatorio",
        storeKey: "finances",
        fields: [
            { name: "inicio", label: "Inicio do periodo", type: "date", required: true },
            { name: "fim", label: "Fim do periodo", type: "date", required: true }
        ],
        readonly: true
    }
};
