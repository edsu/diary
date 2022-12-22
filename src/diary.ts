import fs from 'fs';
import masto from 'masto'
import dotenv from 'dotenv';

import { execSync } from 'child_process';
import { convert as html2text } from 'html-to-text';
import { Configuration, OpenAIApi }  from 'openai';

async function main() {
  let diary = fs.readFileSync('README.md', {encoding: 'utf8'});
  let newEntries = "";
  for await (const prompt of getPrompts()) {
    const date = prompt.created.toLocaleDateString();

    // if the diary already has an entry for this date we're done
    if (diary.match(date)) break

    const result = await getDiaryEntry(prompt.text);
    newEntries += `## ${date}\n\n${result}\n\n`;
  }

  // if we wrote new entries save them and push them to github
  if (newEntries) {
    diary = diary.replace('---', `---\n\n${newEntries}`);
    fs.writeFileSync('README.md', diary, {encoding: 'utf8'});
    execSync('git commit -m "new entry" README.md');
    execSync('git push --quiet origin main');
  }
}

/**
 * Ask GPT-3 to give us a diary extry using the supplied words.
 */

async function getDiaryEntry(text) : Promise<string> {

  const response = await openai.createCompletion({
    model: "text-davinci-003",
    max_tokens: 400,
    prompt: `write a paragraph from a personal diary with the words: ${text}`
  });

  // if openai worked, italicize the seed words in the text and return it
  if (response.data.choices[0].text) {
    let entry = response.data.choices[0].text.trim();
    for (const word of text.split(' ')) {
      entry = entry.replace(new RegExp(word, 'gi'), `*${word}*`);
    }
    return entry; 
  } else {
    throw `Unable to get text for #{text}`;
  }
}

/**
 * Get word prompts from Dan's Mastodon
 */

async function* getPrompts() : AsyncIterable<Prompt> {
  const c = await masto.login({url: 'https://social.coop', accessToken: process.env.MASTODON_TOKEN});
  const results = c.accounts.getStatusesIterable('231442', {sinceId: '1'});
  for await (let result of results) {
    for (const post of result) {
      if (post.spoilerText == 'randomly chosen words') {
        const text = html2text(post.content).replace(/\n/g, ' ');
        yield new Prompt(new Date(post.createdAt), text);
      }
    }
  }
}

class Prompt {
  text: string;
  created: Date;

  constructor(created: Date, text: string) {
    this.created = created;
    this.text = text;
  }
}

// configure OpenAI client once
// they seem to throw a 503 if we do this too much in a loop

dotenv.config();

const openai = new OpenAIApi(
  new Configuration({
    organization: process.env.OPENAI_ORG,
    apiKey: process.env.OPENAI_API_KEY
  })
);

main();
