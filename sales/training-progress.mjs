import { HttpError } from './model.mjs';
import {
  featuredTrainingCourseId, trainingCategories, trainingCertificates, trainingCourses, trainingFaqs, trainingPaths,
} from './training-content.mjs';

const catalog = {
  categories: trainingCategories,
  courses: trainingCourses,
  paths: trainingPaths,
  certificates: trainingCertificates,
  faqs: trainingFaqs,
  featuredCourseId: featuredTrainingCourseId,
  sessions: [],
};
const coursesById = new Map(catalog.courses.map(course => [course.id, course]));

export const TRAINING_ACTIONS = new Set(['training-progress', 'training-update']);

function trainingProgress(saved) {
  return {
    completed: saved?.completed ?? {},
    sections: saved?.sections ?? {},
    currentCourseId: saved?.currentCourseId ?? null,
    plan: saved?.plan ?? [],
  };
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

    const course = coursesById.get(body.courseId);
    if (body.courseId !== undefined && !course) throw new HttpError(400, 'Choose a course from the training catalog.');
    const sectionId = body.sectionId;
    if (sectionId !== undefined && !course?.sections.some(section => section.id === sectionId)) {
      throw new HttpError(400, 'Choose a section from this course.');
    }
    const { add, remove } = planChanges(body.planChanges);
    if (!course && !add.length && !remove.length) throw new HttpError(400, 'Choose training progress to save.');

    const progress = await db.updateTrainingProgress(userId, saved => {
      const current = trainingProgress(saved);
      if (course) {
        current.currentCourseId = course.id;
        if (sectionId !== undefined) current.sections[course.id] = sectionId;
        else if (!Object.hasOwn(current.completed, course.id)) current.completed[course.id] = new Date(now()).toISOString();
      }
      if (add.length || remove.length) {
        const next = new Set(current.plan);
        remove.forEach(id => next.delete(id));
        add.forEach(id => next.add(id));
        current.plan = [...next];
      }
      return current;
    });
    return { progress };
  };
}
