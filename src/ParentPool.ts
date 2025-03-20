export class ParentPool<S, Id = string> {
	private pool = new Map<
		Id,
		{
			claims: Set<Id>;
			state: S;
		}
	>();
	private onParentDelete?: (id: Id, state: S) => void

	constructor(onParentDelete?: (id: Id, state: S) => void) {
		this.onParentDelete = onParentDelete;
	}

	createParent(id: Id, state: S) {
		if (this.pool.has(id)) {
			throw new Error(`Cannot create same parent in pool! ${id}`);
		}

		// Set our selves as a claimant
		this.pool.set(id, {
			claims: new Set([id]),
			state,
		});
	}

	getParentState(parentId: Id): S {
		if (!this.pool.has(parentId)) {
			throw new Error(`Unable to retrieve parent of id ${parentId}`);
		}
		return this.pool.get(parentId)!.state;
	}

	has(parentId: Id) {
		return this.pool.has(parentId);
	}

	claimParent(parentId: Id, selfId: Id) {
		if (!this.pool.has(parentId)) {
			throw new Error(`Unable to claim parent of id ${parentId}`);
		}
		this.pool.get(parentId)!.claims.add(selfId);
	}

	/**
	 * A more tolerant method that will drop itself from a claim on itself and not throw if not found because
	 * child claims can persist and potentially trigger dropSelf's
	 * @param selfParentId
	 */
	tryDropSelf(selfParentId: Id) {
		if (!this.pool.has(selfParentId)) {
			return;
		}

		const parentPool = this.pool.get(selfParentId)!;
		parentPool.claims.delete(selfParentId);
		// Clean up the pool now that no one claims it
		if (parentPool.claims.size === 0) {
			this.pool.delete(selfParentId);
		}
	}

	dropParent(parentId: Id, selfId: Id) {
		if (!this.pool.has(parentId)) {
			throw new Error(
				`Unable to find parent of id ${parentId} in order to drop it`,
			);
		}

		const parentPool = this.pool.get(parentId)!;
		if (!parentPool.claims.delete(selfId)) {
			throw new Error(
				`Cannot drop parent ${parentId}.  Child does not have it claimed.`,
			);
		}
		// Clean up the pool now that no one claims it
		if (parentPool.claims.size === 0) {
			this.onParentDelete?.(parentId, this.getParentState(parentId));
			this.pool.delete(parentId);
		}
	}

	clear() {
		this.pool.clear();
	}
}
