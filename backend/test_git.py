import os
import subprocess
import tempfile
import unittest

import git_repo
from git_repo import GitError
from graph import build_graph
from pathmatch import glob_match, is_excluded, is_included


class PathMatchTest(unittest.TestCase):
    def test_basename_and_directory(self):
        self.assertTrue(glob_match("dbs/app.db", "*.db"))
        self.assertTrue(glob_match("books/note.db", "*.db"))
        self.assertTrue(glob_match("dbs/app.db", "dbs/**"))
        self.assertTrue(glob_match("a/__pycache__/x.pyc", "**/__pycache__/**"))
        self.assertFalse(glob_match("books/note.txt", "dbs/**"))
        self.assertFalse(is_excluded("books/note.txt", ["dbs/**", "*.db"]))
        self.assertTrue(is_excluded("dbs/app.db", ["dbs/**", "*.db"]))

    def test_include_prefix(self):
        self.assertTrue(is_included("books/a.txt", []))
        self.assertTrue(is_included("books/a.txt", ["books"]))
        self.assertFalse(is_included("flows/a.json", ["books", "confs"]))


class GraphTest(unittest.TestCase):
    def test_linear_stays_on_one_lane(self):
        rows = build_graph(
            [
                {"hash": "3", "parents": ["2"]},
                {"hash": "2", "parents": ["1"]},
                {"hash": "1", "parents": []},
            ]
        )
        self.assertEqual([row["lane"] for row in rows], [0, 0, 0])
        self.assertFalse(rows[0]["incoming"])
        self.assertTrue(rows[1]["incoming"])
        self.assertEqual(rows[2]["links"], [])

    def test_merge_links_parents(self):
        rows = build_graph(
            [
                {"hash": "D", "parents": ["B", "C"]},
                {"hash": "C", "parents": ["A"]},
                {"hash": "B", "parents": ["A"]},
                {"hash": "A", "parents": []},
            ]
        )
        by_hash = {row["hash"]: row for row in rows}
        self.assertEqual(
            by_hash["D"]["links"],
            [{"from": 0, "to": 0}, {"from": 0, "to": 1}],
        )
        self.assertEqual(by_hash["C"]["lane"], 1)
        self.assertEqual(by_hash["B"]["links"], [{"from": 0, "to": 1}])
        self.assertEqual(by_hash["A"]["lane"], 1)
        self.assertEqual(by_hash["A"]["links"], [])

    def test_unrelated_roots_do_not_connect(self):
        rows = build_graph(
            [
                {"hash": "B", "parents": []},
                {"hash": "A", "parents": []},
            ]
        )
        self.assertEqual(rows[0]["links"], [])
        self.assertFalse(rows[1]["incoming"])


class StatusParseTest(unittest.TestCase):
    def test_branch_and_files(self):
        text = "\n".join(
            [
                "## main...origin/main [ahead 1, behind 2]",
                "M  staged.txt",
                " M unstaged.txt",
                "MM both.txt",
                "?? new.txt",
                "R  old.txt\tnew.txt",
            ]
        )
        parsed = git_repo.parse_status(text)
        self.assertEqual(parsed["branch"], "main")
        self.assertEqual(parsed["upstream"], "origin/main")
        self.assertEqual(parsed["ahead"], 1)
        self.assertEqual(parsed["behind"], 2)
        self.assertEqual(parsed["stagedCount"], 3)
        self.assertEqual(parsed["unstagedCount"], 2)
        self.assertEqual(parsed["untrackedCount"], 1)
        renamed = next(item for item in parsed["files"] if item["path"] == "new.txt" and item["origPath"])
        self.assertEqual(renamed["origPath"], "old.txt")

    def test_refs(self):
        refs = git_repo.parse_refs(
            "HEAD -> refs/heads/main, refs/remotes/origin/main, refs/tags/v1.0"
        )
        kinds = [(item["kind"], item["name"]) for item in refs]
        self.assertIn(("head", "HEAD"), kinds)
        self.assertIn(("branch", "main"), kinds)
        self.assertIn(("remote", "origin/main"), kinds)
        self.assertIn(("tag", "v1.0"), kinds)


class SafePathTest(unittest.TestCase):
    def test_rejects_escape(self):
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaises(GitError):
                git_repo.safe_rel(folder, "../outside.txt")
            with self.assertRaises(GitError):
                git_repo.safe_rel(folder, "-rf")
            self.assertEqual(git_repo.safe_rel(folder, "books/a.txt"), "books/a.txt")


@unittest.skipUnless(git_repo.git_version(), "git is not installed")
class LiveRepoTest(unittest.TestCase):
    def _init(self, folder: str):
        git_repo.init_repo(folder, initial_commit=False, name="Fat", email="fat@example.com")

    def test_commit_graph_and_branch(self):
        with tempfile.TemporaryDirectory() as folder:
            self._init(folder)
            note = os.path.join(folder, "books")
            os.makedirs(note)
            with open(os.path.join(note, "a.txt"), "w", encoding="utf-8") as handle:
                handle.write("hello\n")
            git_repo.stage(folder, ["books/a.txt"])
            git_repo.commit(folder, "first")
            with open(os.path.join(note, "a.txt"), "w", encoding="utf-8") as handle:
                handle.write("hello world\n")
            changed = git_repo.changes(folder)
            self.assertEqual(changed["unstaged"], 1)
            git_repo.stage_all(folder)
            git_repo.commit(folder, "second")
            git_repo.create_branch(folder, "feature", checkout=True)
            with open(os.path.join(note, "b.txt"), "w", encoding="utf-8") as handle:
                handle.write("side\n")
            git_repo.stage(folder, ["books/b.txt"])
            git_repo.commit(folder, "side")
            git_repo.checkout(folder, "main")
            with open(os.path.join(note, "a.txt"), "a", encoding="utf-8") as handle:
                handle.write("main line\n")
            git_repo.stage(folder, ["books/a.txt"])
            git_repo.commit(folder, "main-2")
            graph = git_repo.graph_log(folder, 20)
            subjects = [item["subject"] for item in graph["commits"]]
            self.assertIn("side", subjects)
            self.assertIn("main-2", subjects)
            self.assertGreaterEqual(graph["maxLane"], 1)
            info = git_repo.summary(folder)
            self.assertEqual(info["branch"], "main")
            self.assertTrue(info["clean"])

    def test_auto_commit_skips_excluded_and_staged(self):
        with tempfile.TemporaryDirectory() as folder:
            self._init(folder)
            with open(os.path.join(folder, "notes.txt"), "w", encoding="utf-8") as handle:
                handle.write("note\n")
            with open(os.path.join(folder, "skip.secret"), "w", encoding="utf-8") as handle:
                handle.write("secret\n")
            settings = {
                "autoCommit": {
                    "enabled": True,
                    "messageTemplate": "chore: auto save {time} {count}",
                    "includeUntracked": True,
                    "includePrefixes": [],
                    "exclude": ["*.secret"],
                }
            }
            result = git_repo.auto_add_and_commit(folder, settings)
            self.assertTrue(result["committed"])
            listed = subprocess.run(
                ["git", "ls-files"],
                cwd=folder,
                capture_output=True,
                text=True,
                check=True,
            )
            files = set(listed.stdout.splitlines())
            self.assertIn("notes.txt", files)
            self.assertNotIn("skip.secret", files)

            with open(os.path.join(folder, "notes.txt"), "a", encoding="utf-8") as handle:
                handle.write("staged\n")
            subprocess.run(["git", "add", "--", "notes.txt"], cwd=folder, check=True)
            with open(os.path.join(folder, "other.txt"), "w", encoding="utf-8") as handle:
                handle.write("other\n")
            skipped = git_repo.auto_add_and_commit(folder, settings)
            self.assertEqual(skipped["skipped"], "staged")
            self.assertFalse(skipped["committed"])
            cached = subprocess.run(
                ["git", "diff", "--cached", "--name-only"],
                cwd=folder,
                capture_output=True,
                text=True,
                check=True,
            )
            self.assertEqual(cached.stdout.strip(), "notes.txt")

    def test_diff_and_discard_untracked(self):
        with tempfile.TemporaryDirectory() as folder:
            self._init(folder)
            path = os.path.join(folder, "draft.txt")
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("draft\n")
            preview = git_repo.diff_file(folder, "draft.txt", "untracked")
            self.assertIn("draft", preview["text"])
            git_repo.discard(folder, "draft.txt", untracked=True)
            self.assertFalse(os.path.exists(path))


if __name__ == "__main__":
    unittest.main()
