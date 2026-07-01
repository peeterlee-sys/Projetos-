CREATE TABLE `historico` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`tipo` text DEFAULT 'nota' NOT NULL,
	`conteudo` text NOT NULL,
	`autor` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`nome_contato` text NOT NULL,
	`telefone` text,
	`email` text,
	`segmento` text,
	`canal_origem` text,
	`valor_negociacao` real,
	`estagio` text DEFAULT 'a_prospectar' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lembretes` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text,
	`data_hora` integer NOT NULL,
	`canal_alerta` text DEFAULT 'ambos' NOT NULL,
	`status` text DEFAULT 'pendente' NOT NULL,
	`enviado_em` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
