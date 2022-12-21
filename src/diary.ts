import fs from 'fs';
import masto from 'masto'
import dotenv from 'dotenv';

import { execSync } from 'child_process';
import { convert as html2text } from 'html-to-text';
import { Configuration, OpenAIApi }  from 'openai';

dotenv.config();

async function main() {
  let diary = fs.readFileSync('README.md', {encoding: 'utf8'});
  let newEntries = "";
  for await (const words of getRandomWords()) {

    const date = words.created.toLocaleDateString();

    // if the diary already has an entry for this date we're done
    if (diary.match(date)) break

    const result = await diaryEntry(words.text);
    newEntries += `## ${date}\n\n${result}`;
  }

  // if we got new entries write them and push them to github
  if (newEntries) {
    diary = diary.replace('---', `---\n\n${newEntries}`);
    fs.writeFileSync('README.md', diary, {encoding: 'utf8'});
    execSync('git commit -m "new entry" README.md');
    execSync('git push origin main');
  }
}

/**
 * Ask GPT-3 to give us a diary extry using the supplied words.
 */

async function diaryEntry(text) {

  const config = new Configuration({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_API_KEY
  });

  const openai = new OpenAIApi(config);

  const response = await openai.createCompletion({
    model: "text-davinci-003",
    max_tokens: 400,
    prompt: `write a paragraph from a personal diary with the words: ${text}`
  });

  if (response.data.choices[0].text) {
    return response.data.choices[0].text.trim();
  } else {
    throw `Unable to get text for #{text}`;
  }
}

/**
 * Get random words by date from Dan's Mastodon
 */

async function* getRandomWords() {
  const c = await masto.login({url: 'https://social.coop', accessToken: process.env.MASTODON_TOKEN});
  const results = c.accounts.getStatusesIterable('231442', {sinceId: '1'});
  for await (let result of results) {
    for (const post of result) {
      if (post.spoilerText == 'randomly chosen words') {
        const text = html2text(post.content).replace(/\n/g, ' ');
        yield {
          created: new Date(post.createdAt),
          text: text
        }
      }
    }
  }
}

main();
