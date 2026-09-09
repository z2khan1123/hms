import { describe, expect, it } from 'vitest';
import { computeVisitStage, type VisitStageInput } from '@hms/shared';

/**
 * The stage a visit is at is derived, never stored, so it is only ever as good
 * as this function. It drives the queue, the OPD list and what the front desk
 * tells a patient who asks how long they will be — so a wrong answer here is a
 * wrong answer given out loud at the desk.
 */

const afterConsultation: VisitStageInput = {
  status: 'completed',
  unpaidItemCount: 0,
  orderedCount: 0,
  inProgressCount: 0,
};

describe('a visit still waiting on the departments', () => {
  it('is not completed while a test is ordered', () => {
    expect(
      computeVisitStage({ ...afterConsultation, orderedCount: 1 }),
    ).toBe('tests_recommended');
  });

  it('is not completed while a test is being processed', () => {
    expect(
      computeVisitStage({ ...afterConsultation, inProgressCount: 1 }),
    ).toBe('tests_in_progress');
  });

  it('is not completed while a specimen sits in the lab', () => {
    // `sample_collected` used to be counted as neither ordered nor in progress,
    // so a patient whose blood had been drawn but not yet processed showed as
    // Completed. The service now folds that status into the in-progress count;
    // this asserts the behaviour that fix exists to produce.
    expect(
      computeVisitStage({ ...afterConsultation, inProgressCount: 1 }),
    ).not.toBe('completed');
  });

  it('puts money first when both money and tests are outstanding', () => {
    // The department will not start until the charge is settled, so telling the
    // patient "tests in progress" would be wrong and would send them to the
    // wrong window.
    expect(
      computeVisitStage({
        ...afterConsultation,
        unpaidItemCount: 1,
        inProgressCount: 1,
      }),
    ).toBe('payment_pending');
  });
});

describe('a visit the doctor has not finished', () => {
  it('reports the consultation, whatever the departments are doing', () => {
    for (const counts of [
      { orderedCount: 0, inProgressCount: 0 },
      { orderedCount: 3, inProgressCount: 2 },
    ]) {
      expect(
        computeVisitStage({
          status: 'in_consultation',
          unpaidItemCount: 5,
          ...counts,
        }),
      ).toBe('in_consultation');
    }
  });

  it('is cancelled regardless of anything else outstanding', () => {
    expect(
      computeVisitStage({
        status: 'cancelled',
        unpaidItemCount: 4,
        orderedCount: 2,
        inProgressCount: 1,
      }),
    ).toBe('cancelled');
  });
});
