import { HttpError } from './model.mjs';
import {
  featuredTrainingCourseId, trainingCategories, trainingCertificates, trainingCourseExercises, trainingCourses,
  trainingFaqs, trainingPaths, trainingPlaybooks,
} from './training-content.mjs';
import { trainingScenarios } from './training-scenarios.mjs';

const requiredCorrect = questions => Math.ceil(questions.length * 0.8);
const catalog = {
  categories: trainingCategories,
  courses: trainingCourses,
  paths: trainingPaths,
  certificates: trainingCertificates,
  faqs: trainingFaqs,
  featuredCourseId: featuredTrainingCourseId,
  exercises: Object.fromEntries(Object.entries(trainingCourseExercises).map(([id, exercise]) => [id, {
    questions: exercise.questions.map(({ id, prompt, options }) => ({ id, prompt, options })),
    practice: exercise.practice.map(({ id, prompt, checklist }) => ({ id, prompt, checklist })),
    requiredCorrect: requiredCorrect(exercise.questions),
  }])),
  playbooks: trainingPlaybooks,
  scenarios: trainingScenarios.map(({ id, title, setting, opening, passPercent, stages }) => ({
    id, title, setting, opening, passPercent,
    stages: stages.map(({ id, phase, title, prompt, options }) => ({
      id, phase, title, prompt, options: options.map(({ label }) => ({ label })),
    })),
  })),
  sessions: [],
};
const coursesById = new Map(catalog.courses.map(course => [course.id, course]));
const scenariosById = new Map(trainingScenarios.map(scenario => [scenario.id, scenario]));

export const TRAINING_ACTIONS = new Set(['training-progress', 'training-update']);

function trainingProgress(saved) {
  const sections = saved?.sections ?? {};
  return {
    completed: saved?.completed ?? {},
    sections,
    visitedSections: saved?.visitedSections ?? Object.fromEntries(Object.entries(sections).map(([id, section]) => [id, [section]])),
    assessments: saved?.assessments ?? {},
    practice: saved?.practice ?? {},
    scenarios: saved?.scenarios ?? {},
    currentCourseId: saved?.currentCourseId ?? null,
    plan: saved?.plan ?? [],
  };
}

function selectAnswers(items, answers) {
  if (!items?.length || !answers || typeof answers !== 'object' || Array.isArray(answers) ||
      Object.keys(answers).length !== items.length) {
    throw new HttpError(400, 'Submit an answer for every step in this exercise.');
  }
  return items.map(item => {
    const choice = answers[item.id];
    if (!Object.hasOwn(answers, item.id) || !Number.isInteger(choice) || choice < 0 || choice >= item.options.length) {
      throw new HttpError(400, 'Choose a valid answer for every step in this exercise.');
    }
    return choice;
  });
}

function gradeAssessment(exercise, submission) {
  const questions = exercise?.questions;
  const choices = selectAnswers(questions, submission?.answers);
  const feedback = questions.map((question, index) => ({
    id: question.id, correct: choices[index] === question.correct, explanation: question.explanation,
  }));
  const score = feedback.filter(answer => answer.correct).length;
  return { score, total: questions.length, passed: score >= requiredCorrect(questions), answers: feedback };
}

async function saveScenarioAttempt(db, userId, submission, now) {
  const scenario = scenariosById.get(submission?.scenarioId);
  if (!scenario) throw new HttpError(400, 'Choose a scenario from the training catalog.');
  const choices = selectAnswers(scenario.stages, submission.answers);
  const feedback = scenario.stages.map((stage, index) => {
    const choice = choices[index];
    return { stageId: stage.id, correct: choice === stage.correct, feedback: stage.options[choice].feedback };
  });
  const correct = feedback.filter(answer => answer.correct).length;
  const total = scenario.stages.length;
  const percent = Math.round(correct * 100 / total);
  const passed = correct * 100 >= scenario.passPercent * total;
  const progress = await db.updateTrainingProgress(userId, saved => {
    const current = trainingProgress(saved);
    const latest = { correct, total, percent, passed, attemptedAt: new Date(now()).toISOString() };
    const previousBest = current.scenarios[scenario.id]?.best;
    const best = !previousBest || correct * previousBest.total > previousBest.correct * total ? latest : previousBest;
    current.scenarios[scenario.id] = { latest, best };
    return current;
  });
  return { progress, scenarioResult: { scenarioId: scenario.id, correct, total, percent, passed, feedback } };
}

function checkPractice(exercise, submission) {
  const task = exercise?.practice.find(item => item.id === submission?.id);
  const checked = submission?.checked;
  if (!task || !Array.isArray(checked) || checked.length > task.checklist.length ||
      checked.some(index => !Number.isInteger(index) || index < 0 || index >= task.checklist.length) ||
      new Set(checked).size !== checked.length) {
    throw new HttpError(400, 'Choose valid checklist items from this practice exercise.');
  }
  return {
    id: task.id,
    checked: [...checked].sort((a, b) => a - b),
    complete: checked.length === task.checklist.length,
  };
}

function completeCourse(current, course, exercise, savedAt) {
  const { id } = course;
  if (Object.hasOwn(current.completed, id)) return;
  const visited = current.visitedSections[id] ?? [];
  if (!course.sections.every(section => visited.includes(section.id))) {
    throw new HttpError(409, 'Work through every lesson before completing this course.');
  }
  if (!current.assessments[id]?.passedAt) {
    throw new HttpError(409, 'Pass the assessment before completing this course.');
  }
  if (!exercise?.practice.length || !exercise.practice.every(task => current.practice[id]?.[task.id]?.completedAt)) {
    throw new HttpError(409, 'Finish all practice checklists before completing this course.');
  }
  current.completed[id] = savedAt;
}

function planCourses(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > coursesById.size || !value.every(id => coursesById.has(id))) {
    throw new HttpError(400, 'Choose courses from the training catalog.');
  }
  return [...new Set(value)];
}

function planChanges(value) {
  if (value === undefined) return { add: [], remove: [] };
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Choose courses to add to or remove from your learning plan.');
  }
  const add = planCourses(value.add);
  const remove = planCourses(value.remove);
  if (add.some(id => remove.includes(id))) throw new HttpError(400, 'Choose one change per course in your learning plan.');
  return { add, remove };
}

export function trainingTools(db, now = Date.now) {
  return async (user, action, body) => {
    if (!['owner', 'agent'].includes(user.role)) throw new HttpError(403, 'Open the Sales Workspace to use training.');
    if (typeof db.trainingProgress !== 'function' || typeof db.updateTrainingProgress !== 'function') {
      throw new HttpError(503, 'Training progress is unavailable in this workspace.');
    }
    const userId = String(user.id);
    if (action === 'training-progress') {
      return { catalog, progress: trainingProgress(await db.trainingProgress(userId)) };
    }
    if (body.scenarioAttempt !== undefined) {
      if (['courseId', 'sectionId', 'assessment', 'practice', 'planChanges'].some(key => body[key] !== undefined)) {
        throw new HttpError(400, 'Save the scenario attempt separately from course and plan updates.');
      }
      return saveScenarioAttempt(db, userId, body.scenarioAttempt, now);
    }

    const course = coursesById.get(body.courseId);
    if (body.courseId !== undefined && !course) throw new HttpError(400, 'Choose a course from the training catalog.');
    const sectionId = body.sectionId;
    if (sectionId !== undefined && !course?.sections.some(section => section.id === sectionId)) {
      throw new HttpError(400, 'Choose a section from this course.');
    }
    const exercise = course && trainingCourseExercises[course.id];
    const assessment = body.assessment === undefined ? null : gradeAssessment(exercise, body.assessment);
    const practice = body.practice === undefined ? null : checkPractice(exercise, body.practice);
    const { add, remove } = planChanges(body.planChanges);
    if (!course && !add.length && !remove.length) throw new HttpError(400, 'Choose training progress to save.');

    const progress = await db.updateTrainingProgress(userId, saved => {
      const current = trainingProgress(saved);
      if (course) {
        const savedAt = new Date(now()).toISOString();
        current.currentCourseId = course.id;
        if (sectionId !== undefined) {
          current.sections[course.id] = sectionId;
          current.visitedSections[course.id] = [...new Set([...(current.visitedSections[course.id] ?? []), sectionId])];
        }
        if (assessment) {
          current.assessments[course.id] = {
            score: assessment.score,
            total: assessment.total,
            passed: assessment.passed,
            attemptedAt: savedAt,
            passedAt: current.assessments[course.id]?.passedAt ?? (assessment.passed ? savedAt : null),
          };
        }
        if (practice) {
          const tasks = current.practice[course.id] ??= {};
          const completedAt = practice.complete ? (tasks[practice.id]?.completedAt ?? savedAt) : null;
          tasks[practice.id] = { checked: practice.checked, completedAt };
        }
        if (sectionId === undefined && !assessment && !practice) completeCourse(current, course, exercise, savedAt);
      }
      if (add.length || remove.length) {
        const next = new Set(current.plan);
        remove.forEach(id => next.delete(id));
        add.forEach(id => next.add(id));
        current.plan = [...next];
      }
      return current;
    });
    return assessment ? { progress, result: { assessment } } : { progress };
  };
}
