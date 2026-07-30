import { Command } from "commander";
import { client } from "../lib/client.js";
import { globalFlags } from "../lib/config.js";
import { handleError } from "../lib/errors.js";
import { output } from "../lib/output.js";
import { splitList } from "../lib/values.js";

const wantsJson = (opts: { json?: boolean }) => opts.json ?? globalFlags.json;

type ActionOpts = {
  json?: boolean;
  format?: string;
  fields?: string;
  type?: string;
  question?: string;
  options?: string;
  cursor?: string;
  limit?: string;
};

const surveyRow = (survey: any) => ({
  id: survey?.id,
  type: survey?.type,
  question: survey?.question,
  responses: survey?.responsesCount ?? 0,
  comments: survey?.commentsCount ?? 0,
  source: survey?.sourceName,
  archived: survey?.archived ?? false,
});

export const surveysResource = new Command("surveys").description(
  "Read and manage in-email surveys",
);

surveysResource
  .command("list")
  .description("List surveys with their response counters")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/surveys")) as {
        surveys?: any[];
      };
      output(wantsJson(opts) ? data : (data.surveys ?? []).map(surveyRow), {
        json: opts.json,
        format: opts.format,
        fields: opts.fields?.split(","),
      });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

surveysResource
  .command("get")
  .description("Show one survey with its aggregate score and latest answers")
  .argument("<survey-id>", "Survey ID")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (surveyId: string, opts: ActionOpts) => {
    try {
      const data = (await client.get(
        `/email/surveys/${encodeURIComponent(surveyId)}`,
      )) as { survey?: any; averageScore?: number | null };
      output(
        wantsJson(opts)
          ? data
          : { ...surveyRow(data.survey), averageScore: data.averageScore },
        { json: opts.json, format: opts.format },
      );
    } catch (err) {
      handleError(err, opts.json);
    }
  });

surveysResource
  .command("create")
  .description("Create a survey to reference from an email survey block")
  .requiredOption("--type <type>", "nps|rating|yesno|choice")
  .option("--question <question>", "Question shown in the email")
  .option("--options <options>", "Comma-separated choices (choice surveys)")
  .option("--json", "Output as JSON")
  .action(async (opts: ActionOpts) => {
    try {
      const data = await client.post("/email/surveys", {
        type: opts.type,
        ...(opts.question && { question: opts.question }),
        ...(opts.options && { options: splitList(opts.options) }),
      });
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

surveysResource
  .command("responses")
  .description("List individual answers to a survey, newest first")
  .argument("<survey-id>", "Survey ID")
  .option("--cursor <cursor>", "Cursor from the previous page")
  .option("--limit <n>", "Rows per page (1-200)")
  .option("--fields <cols>", "Comma-separated columns to display")
  .option("--json", "Output as JSON")
  .option("--format <fmt>", "Output format: text, json, csv, yaml")
  .action(async (surveyId: string, opts: ActionOpts) => {
    try {
      const data = (await client.get("/email/surveys/responses", {
        surveyId,
        ...(opts.cursor && { cursor: opts.cursor }),
        ...(opts.limit && { limit: opts.limit }),
      })) as { responses?: any[]; cursor?: string | null };
      output(wantsJson(opts) ? data : (data.responses ?? []), {
        json: opts.json,
        format: opts.format,
        fields: opts.fields?.split(","),
      });
      if (!wantsJson(opts) && data.cursor) {
        console.error(`next page: --cursor ${data.cursor}`);
      }
    } catch (err) {
      handleError(err, opts.json);
    }
  });

surveysResource
  .command("archive")
  .description("Hide a survey from the results page")
  .argument("<survey-id>", "Survey ID")
  .option("--json", "Output as JSON")
  .action(async (surveyId: string, opts: ActionOpts) => {
    try {
      const data = await client.delete(
        `/email/surveys/${encodeURIComponent(surveyId)}`,
      );
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });

surveysResource
  .command("restore")
  .description("Bring an archived survey back")
  .argument("<survey-id>", "Survey ID")
  .option("--json", "Output as JSON")
  .action(async (surveyId: string, opts: ActionOpts) => {
    try {
      const data = await client.delete(
        `/email/surveys/${encodeURIComponent(surveyId)}?restore=true`,
      );
      output(data, { json: opts.json });
    } catch (err) {
      handleError(err, opts.json);
    }
  });
